const fs = require('fs')
const os = require('os')
const path = require('path')
const { DEFAULT_CONFIG } = require('./config')
const { removeLegacyAutostart } = require('./legacy-cleanup')

const STEEL_HOME = path.join(os.homedir(), '.steelgate')
const CLAUDE_SETTINGS = path.join(os.homedir(), '.claude', 'settings.json')
const CODEX_HOOKS = path.join(os.homedir(), '.codex', 'hooks.json')

function buildRuntimeOptions({ appRoot, desktopExecutable, isPackaged }) {
  return {
    appRoot,
    desktopExecutable,
    desktopArgs: isPackaged ? [] : [path.join(appRoot, 'src', 'app', 'main.js')],
  }
}

function installRuntime({ appRoot, desktopExecutable, desktopArgs = [] }) {
  removeLegacyAutostart()
  ensureDir(STEEL_HOME)
  ensureDir(path.join(STEEL_HOME, 'hooks'))
  ensureDir(path.join(STEEL_HOME, 'logs'))
  ensureDir(path.join(STEEL_HOME, 'assets', 'sounds'))

  copyFile(path.join(appRoot, 'assets', 'icon.png'), path.join(STEEL_HOME, 'assets', 'icon.png'))
  copyFile(path.join(appRoot, 'assets', 'sounds', 'trigger.mp3'), path.join(STEEL_HOME, 'assets', 'sounds', 'trigger.mp3'))

  for (const name of ['claude-hook.js', 'codex-hook.js', 'hook-common.js', 'codex-prompt.js']) {
    copyFile(path.join(appRoot, 'src', 'hook', name), path.join(STEEL_HOME, 'hooks', name))
  }
  copyDir(path.join(appRoot, 'src', 'shared'), path.join(STEEL_HOME, 'shared'))

  const configPath = path.join(STEEL_HOME, 'config.json')
  const existing = readJson(configPath) || {}
  const config = {
    ...DEFAULT_CONFIG,
    ...existing,
    desktopExecutable,
    desktopArgs,
  }
  delete config.desktopEntry
  writeJsonAtomic(configPath, config)

  sanitizeStoredEvents()
  const claudeOk = mergeHookFile(CLAUDE_SETTINGS, 'claude-hook.js')
  const codexOk = mergeHookFile(CODEX_HOOKS, 'codex-hook.js')
  return { claudeOk, codexOk }
}

function uninstallRuntime() {
  removeLegacyAutostart()
  removeHookFromFile(CLAUDE_SETTINGS)
  removeHookFromFile(CODEX_HOOKS)
}

function removeHookFromFile(filePath) {
  const settings = readJson(filePath)
  if (!settings || !settings.hooks || !settings.hooks.UserPromptSubmit) return
  settings.hooks.UserPromptSubmit = settings.hooks.UserPromptSubmit.filter(entry => !isSteelGateHook(entry))
  writeJsonAtomic(filePath, settings)
}

function mergeHookFile(filePath, hookFile) {
  try {
    const settings = readJson(filePath) || {}
    if (!settings.hooks) settings.hooks = {}
    if (!settings.hooks.UserPromptSubmit) settings.hooks.UserPromptSubmit = []
    settings.hooks.UserPromptSubmit = settings.hooks.UserPromptSubmit.filter(entry => !isSteelGateHook(entry))
    settings.hooks.UserPromptSubmit.push({
      hooks: [{
        type: 'command',
        command: `node "${path.join(STEEL_HOME, 'hooks', hookFile)}"`,
        timeout: 5,
      }],
    })
    writeJsonAtomic(filePath, settings)
    return true
  } catch (_) {
    return false
  }
}

function sanitizeStoredEvents() {
  const eventsPath = path.join(STEEL_HOME, 'events.ndjson')
  if (!fs.existsSync(eventsPath)) return
  const allowed = ['date', 'source', 'chars', 'layers', 'gainHp', 'intensity', 'timestamp', 'capped']
  const sanitized = fs.readFileSync(eventsPath, 'utf8').split('\n').filter(Boolean).map(line => {
    try {
      const event = JSON.parse(line)
      return JSON.stringify(Object.fromEntries(allowed.filter(key => key in event).map(key => [key, event[key]])))
    } catch (_) {
      return null
    }
  }).filter(Boolean)
  fs.writeFileSync(eventsPath, sanitized.join('\n') + (sanitized.length ? '\n' : ''), 'utf8')
}

function isSteelGateHook(entry) {
  const text = JSON.stringify(entry)
  return text.includes('steelgate') || text.includes('.steelgate')
}

function readJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')) } catch (_) { return null }
}

function writeJsonAtomic(filePath, data) {
  ensureDir(path.dirname(filePath))
  const tmp = filePath + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
  fs.renameSync(tmp, filePath)
}

function copyFile(src, dest) {
  if (!fs.existsSync(src)) return
  ensureDir(path.dirname(dest))
  fs.copyFileSync(src, dest)
}

function copyDir(src, dest) {
  ensureDir(dest)
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name)
    const to = path.join(dest, entry.name)
    if (entry.isDirectory()) copyDir(from, to)
    else fs.copyFileSync(from, to)
  }
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

module.exports = { buildRuntimeOptions, installRuntime, uninstallRuntime }
