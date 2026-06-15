#!/usr/bin/env node
const path = require('path')
const fs = require('fs')
const os = require('os')
const { removeLegacyAutostart } = require('../shared/legacy-cleanup')

// Resolve paths relative to this script
const SCRIPT_DIR = path.join(__dirname, '..')  // src/
const PROJECT_ROOT = path.join(__dirname, '..', '..')  // steelgate/
const STEEL_HOME = path.join(os.homedir(), '.steelgate')
const CLAUDE_SETTINGS = path.join(os.homedir(), '.claude', 'settings.json')
const CODEX_HOOKS = path.join(os.homedir(), '.codex', 'hooks.json')

// Hook command templates
function getHookCommand(hookFile) {
  const hookPath = path.join(STEEL_HOME, 'hooks', hookFile)
  return `node "${hookPath}"`
}

const CLAUDE_HOOK_ENTRY = {
  hooks: [
    {
      type: 'command',
      command: getHookCommand('claude-hook.js'),
      timeout: 5,
    },
  ],
}

const CODEX_HOOK_ENTRY = {
  hooks: [
    {
      type: 'command',
      command: getHookCommand('codex-hook.js'),
      timeout: 5,
    },
  ],
}

function main() {
  const args = process.argv.slice(2)
  const command = args[0]

  switch (command) {
    case 'install':
      doInstall()
      break
    case 'uninstall':
      doUninstall()
      break
    case 'status':
      doStatus()
      break
    case 'reset':
      doReset(args[1])
      break
    default:
      printUsage()
      process.exit(1)
  }
}

function printUsage() {
  console.log(`
钢门 SteelGate — AI Coding 叠钢反馈工具

用法：
  steelgate install         安装 Hook 和数据目录
  steelgate uninstall       移除 Hook（保留数据）
  steelgate status          查看今日叠钢状态
  steelgate reset today     重置今日数据
`)
}

// ==================== INSTALL ====================

function doInstall() {
  console.log('正在安装钢门...')
  const removedLegacyAutostart = removeLegacyAutostart()

  // 1. Create directories
  ensureDir(STEEL_HOME)
  ensureDir(path.join(STEEL_HOME, 'hooks'))
  ensureDir(path.join(STEEL_HOME, 'logs'))
  ensureDir(path.join(STEEL_HOME, 'assets', 'sounds'))

  // 2. Copy assets
  copyAsset(
    path.join(PROJECT_ROOT, 'assets', 'icon.png'),
    path.join(STEEL_HOME, 'assets', 'icon.png')
  )
  copyAsset(
    path.join(PROJECT_ROOT, 'assets', 'sounds', 'trigger.mp3'),
    path.join(STEEL_HOME, 'assets', 'sounds', 'trigger.mp3')
  )

  // 3. Install hook scripts
  installHookScript('claude-hook.js')
  installHookScript('codex-hook.js')

  // 4. Also copy hook-common.js (shared dependency)
  installHookScript('hook-common.js')
  installHookScript('codex-prompt.js')

  // 5. Copy shared modules
  copyDirSync(path.join(SCRIPT_DIR, 'shared'), path.join(STEEL_HOME, 'shared'))

  // 6. Initialize user configuration, including the desktop launch command
  initializeConfig()
  sanitizeStoredEvents()

  // 7. Merge Claude Code and Codex hooks
  const claudeOk = mergeClaudeHooks()
  const codexOk = mergeCodexHooks()

  // 8. Print result
  console.log('')
  console.log('钢门已安装。')
  console.log(`  数据目录：${STEEL_HOME}`)
  console.log(`  Claude Code Hook：${claudeOk ? '已启用' : '安装失败'}`)
  console.log(`  Codex Hook：${codexOk ? '已启用' : '安装失败'}`)
  if (removedLegacyAutostart) console.log('  旧版开机自启：已清理')
  console.log('')
  console.log('本工具只统计字数、层数和血量，不保存 prompt 原文。')
  console.log('第一次有效叠钢时会自动唤起桌面 HUD。')
  console.log('请重启已打开的 Claude Code / Codex 会话；Codex 首次使用还需在 /hooks 中信任该 Hook。')
}

function initializeConfig() {
  const configPath = path.join(STEEL_HOME, 'config.json')
  let existing = {}
  try {
    if (fs.existsSync(configPath)) {
      existing = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    }
  } catch (_) {}

  const defaults = require('../shared/config').DEFAULT_CONFIG
  const config = {
    ...defaults,
    ...existing,
    desktopExecutable: require('electron'),
    desktopArgs: [path.join(PROJECT_ROOT, 'src', 'app', 'main.js')],
  }
  delete config.desktopEntry
  writeJsonAtomic(configPath, config)
}

function sanitizeStoredEvents() {
  const eventsPath = path.join(STEEL_HOME, 'events.ndjson')
  if (!fs.existsSync(eventsPath)) return

  const allowed = ['date', 'source', 'chars', 'layers', 'gainHp', 'intensity', 'timestamp', 'capped']
  const lines = fs.readFileSync(eventsPath, 'utf8').split('\n').filter(line => line.trim())
  let changed = false
  const sanitized = lines.map(line => {
    try {
      const event = JSON.parse(line)
      const clean = {}
      for (const key of allowed) {
        if (Object.prototype.hasOwnProperty.call(event, key)) clean[key] = event[key]
      }
      if (Object.keys(event).length !== Object.keys(clean).length) changed = true
      return JSON.stringify(clean)
    } catch (_) {
      changed = true
      return null
    }
  }).filter(Boolean)

  if (changed) {
    fs.writeFileSync(eventsPath, sanitized.join('\n') + (sanitized.length ? '\n' : ''), 'utf8')
  }
}

function mergeClaudeHooks() {
  try {
    let settings = {}
    if (fs.existsSync(CLAUDE_SETTINGS)) {
      const raw = fs.readFileSync(CLAUDE_SETTINGS, 'utf8')
      settings = JSON.parse(raw)
    }

    if (!settings.hooks) settings.hooks = {}
    if (!settings.hooks.UserPromptSubmit) settings.hooks.UserPromptSubmit = []

    // Remove existing steelgate entries
    settings.hooks.UserPromptSubmit = settings.hooks.UserPromptSubmit.filter(entry => {
      const cmd = JSON.stringify(entry)
      return !cmd.includes('steelgate') && !cmd.includes('.steelgate')
    })

    // Add our hook
    settings.hooks.UserPromptSubmit.push(CLAUDE_HOOK_ENTRY)

    // Write back
    ensureDir(path.dirname(CLAUDE_SETTINGS))
    const tmpPath = CLAUDE_SETTINGS + '.tmp'
    fs.writeFileSync(tmpPath, JSON.stringify(settings, null, 2), 'utf8')
    fs.renameSync(tmpPath, CLAUDE_SETTINGS)

    return true
  } catch (err) {
    console.error(`  合并 Claude Code Hook 失败：${err.message}`)
    return false
  }
}

function mergeCodexHooks() {
  try {
    let settings = {}
    if (fs.existsSync(CODEX_HOOKS)) {
      settings = JSON.parse(fs.readFileSync(CODEX_HOOKS, 'utf8'))
    }

    if (!settings.hooks) settings.hooks = {}
    if (!settings.hooks.UserPromptSubmit) settings.hooks.UserPromptSubmit = []
    settings.hooks.UserPromptSubmit = removeSteelGateHooks(settings.hooks.UserPromptSubmit)
    settings.hooks.UserPromptSubmit.push(CODEX_HOOK_ENTRY)

    writeJsonAtomic(CODEX_HOOKS, settings)
    return true
  } catch (err) {
    console.error(`  合并 Codex Hook 失败：${err.message}`)
    return false
  }
}

// ==================== UNINSTALL ====================

function doUninstall() {
  console.log('正在卸载钢门...')
  const removedLegacyAutostart = removeLegacyAutostart()

  // Remove Claude Code hooks
  try {
    if (fs.existsSync(CLAUDE_SETTINGS)) {
      const settings = JSON.parse(fs.readFileSync(CLAUDE_SETTINGS, 'utf8'))
      if (settings.hooks && settings.hooks.UserPromptSubmit) {
        settings.hooks.UserPromptSubmit = settings.hooks.UserPromptSubmit.filter(entry => {
          const cmd = JSON.stringify(entry)
          return !cmd.includes('steelgate') && !cmd.includes('.steelgate')
        })
        const tmpPath = CLAUDE_SETTINGS + '.tmp'
        fs.writeFileSync(tmpPath, JSON.stringify(settings, null, 2), 'utf8')
        fs.renameSync(tmpPath, CLAUDE_SETTINGS)
        console.log('  Claude Code Hook：已移除')
      }
    }
  } catch (err) {
    console.error(`  移除 Claude Code Hook 失败：${err.message}`)
  }

  try {
    if (fs.existsSync(CODEX_HOOKS)) {
      const settings = JSON.parse(fs.readFileSync(CODEX_HOOKS, 'utf8'))
      if (settings.hooks && settings.hooks.UserPromptSubmit) {
        settings.hooks.UserPromptSubmit = removeSteelGateHooks(settings.hooks.UserPromptSubmit)
        writeJsonAtomic(CODEX_HOOKS, settings)
        console.log('  Codex Hook：已移除')
      }
    }
  } catch (err) {
    console.error(`  移除 Codex Hook 失败：${err.message}`)
  }

  console.log('')
  console.log('钢门已卸载。')
  if (removedLegacyAutostart) console.log('旧版开机自启已清理。')
  console.log(`本地数据保留在：${STEEL_HOME}`)
  console.log('如需删除数据，请手动删除该目录。')
}

// ==================== STATUS ====================

function doStatus() {
  const statsPath = path.join(STEEL_HOME, 'stats.json')

  // Check Claude Code hook
  let claudeHook = 'disabled'
  try {
    if (fs.existsSync(CLAUDE_SETTINGS)) {
      const settings = JSON.parse(fs.readFileSync(CLAUDE_SETTINGS, 'utf8'))
      if (settings.hooks && settings.hooks.UserPromptSubmit) {
        const hasHook = settings.hooks.UserPromptSubmit.some(entry => {
          const cmd = JSON.stringify(entry)
          return cmd.includes('steelgate') || cmd.includes('.steelgate')
        })
        claudeHook = hasHook ? 'enabled' : 'disabled'
      }
    }
  } catch (_) {}

  let codexHook = 'disabled'
  try {
    if (fs.existsSync(CODEX_HOOKS)) {
      const settings = JSON.parse(fs.readFileSync(CODEX_HOOKS, 'utf8'))
      if (settings.hooks && settings.hooks.UserPromptSubmit) {
        codexHook = settings.hooks.UserPromptSubmit.some(isSteelGateHook) ? 'enabled' : 'disabled'
      }
    }
  } catch (_) {}

  const configPath = path.join(STEEL_HOME, 'config.json')
  const config = readJson(configPath) || {}
  const executableOk = typeof config.desktopExecutable === 'string' && fs.existsSync(config.desktopExecutable)
  const firstArg = Array.isArray(config.desktopArgs) ? config.desktopArgs[0] : null
  const entryOk = !firstArg || !path.isAbsolute(firstArg) || fs.existsSync(firstArg)

  // Read stats
  let stats = null
  try {
    if (fs.existsSync(statsPath)) {
      stats = JSON.parse(fs.readFileSync(statsPath, 'utf8'))
    }
  } catch (_) {}

  // Check today
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const isToday = stats && stats.activeDate === todayStr

  console.log('')
  console.log('钢门 SteelGate 状态')
  console.log('─'.repeat(40))
  console.log(`  Claude Code Hook: ${claudeHook}`)
  console.log(`  Codex Hook:       ${codexHook}`)
  console.log(`  HUD 启动命令:     ${executableOk && entryOk ? '可用' : '失效，请重新安装 Hook'}`)
  console.log(`  数据目录:         ${fs.existsSync(STEEL_HOME) ? '已安装' : '未找到'}`)
  console.log('─'.repeat(40))

  if (isToday && stats) {
    console.log(`  Active Date:   ${stats.activeDate}`)
    console.log(`  Today Layers:  ${stats.todayLayers}`)
    console.log(`  Today HP:      ${stats.todayHp}`)
    console.log(`  Today Chars:   ${stats.todayChars}`)
    console.log(`  Today Triggers: ${stats.todayTriggers}`)
  } else {
    console.log('  今日暂无叠钢记录。')
  }
  console.log('')
}

// ==================== RESET ====================

function doReset(target) {
  if (target !== 'today') {
    console.error('用法：steelgate reset today')
    process.exit(1)
  }

  const statsPath = path.join(STEEL_HOME, 'stats.json')
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  const initialHp = require('../shared/config').STEEL_CONFIG.initialHp
  const emptyStats = {
    activeDate: todayStr,
    todayLayers: 0,
    todayHp: initialHp,
    todayChars: 0,
    todayTriggers: 0,
    sessionLayers: 0,
    sessionHpGained: 0,
    sessionChars: 0,
    sessionTriggers: 0,
    maxSingleLayers: 0,
    maxSingleChars: 0,
    firstTriggerAt: null,
    lastTriggerAt: null,
  }

  try {
    ensureDir(STEEL_HOME)
    const tmpPath = statsPath + '.tmp'
    fs.writeFileSync(tmpPath, JSON.stringify(emptyStats, null, 2), 'utf8')
    fs.renameSync(tmpPath, statsPath)
    console.log('今日数据已重置。')
  } catch (err) {
    console.error(`重置失败：${err.message}`)
    process.exit(1)
  }
}

// ==================== HELPERS ====================

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function copyAsset(src, dest) {
  try {
    if (fs.existsSync(src)) {
      ensureDir(path.dirname(dest))
      fs.copyFileSync(src, dest)
    }
  } catch (err) {
    console.warn(`  复制资源失败 ${src} → ${dest}：${err.message}`)
  }
}

function installHookScript(filename) {
  const src = path.join(SCRIPT_DIR, 'hook', filename)
  const dest = path.join(STEEL_HOME, 'hooks', filename)
  copyAsset(src, dest)
}

function copyDirSync(src, dest) {
  ensureDir(dest)
  const entries = fs.readdirSync(src, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}

function isSteelGateHook(entry) {
  const cmd = JSON.stringify(entry)
  return cmd.includes('steelgate') || cmd.includes('.steelgate')
}

function removeSteelGateHooks(entries) {
  return entries.filter(entry => !isSteelGateHook(entry))
}

function writeJsonAtomic(filePath, data) {
  ensureDir(path.dirname(filePath))
  const tmpPath = filePath + '.tmp'
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8')
  fs.renameSync(tmpPath, filePath)
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch (_) {
    return null
  }
}

main()
