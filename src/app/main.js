const { app, BrowserWindow, Tray, Menu, screen, ipcMain, nativeImage } = require('electron')
const http = require('http')
const path = require('path')
const fs = require('fs')
const { STEEL_PORT, PATHS, STEEL_CONFIG } = require('../shared/config')
const { applySteelEvent, readPendingEvents, clearPendingEvents, ensureTodayStats, readStats, resetSessionStats } = require('../shared/data')
const { normalizeSteelEvent } = require('../shared/steel-event')
const { log } = require('../shared/logger')
const { buildRuntimeOptions, installRuntime, uninstallRuntime } = require('../shared/runtime-install')
const { isHookLaunchEnabled, setHookLaunchEnabled } = require('../shared/lifecycle-state')

let mainWindow = null
let tray = null
let server = null
let hideTimer = null
let quitTimer = null
let currentPort = STEEL_PORT
let currentScale = 1.0
let rendererReady = false
let explicitQuit = false
const rendererEventQueue = []

const HIDE_TIMEOUT = STEEL_CONFIG.autoHideMs || 1800000
const QUIT_TIMEOUT = STEEL_CONFIG.autoExitMs || 3600000
const SCALE_OPTIONS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0]
const STATE_FILE = path.join(PATHS.home, 'ui-state.json')
const IS_HOOK_LAUNCH = process.argv.includes('--hook-launch')
const IS_AUTO_START = process.argv.includes('--autostart')
const IS_MANUAL_LAUNCH = !IS_HOOK_LAUNCH && !IS_AUTO_START

const BASE_W = Math.max(300, STEEL_CONFIG.healthBarWidth + 100)
const BASE_H = 130
const MARGIN = 24

// ---- Scale persistence ----
function readScale() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')).scale || 1.0 }
  catch (_) { return 1.0 }
}

function writeScale(s) {
  try {
    const dir = path.dirname(STATE_FILE)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(STATE_FILE, JSON.stringify({ scale: s }, null, 2), 'utf8')
  } catch (_) {}
}

// ---- Window ----
function createWindow() {
  const s = readScale()
  currentScale = s
  const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize
  const w = Math.round(BASE_W * s)
  const h = Math.round(BASE_H * s)

  mainWindow = new BrowserWindow({
    width: w,
    height: h,
    x: screenW - w - MARGIN,
    y: screenH - h - MARGIN,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    resizable: false,
    movable: false,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.setAlwaysOnTop(true, 'pop-up-menu')

  // Click-through: transparent areas pass mouse through, hover on content re-enables
  mainWindow.setIgnoreMouseEvents(true, { forward: true })

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'))

  mainWindow.webContents.on('did-finish-load', () => {
    rendererReady = true
    mainWindow.webContents.send('set-scale', currentScale)
    while (rendererEventQueue.length > 0) {
      mainWindow.webContents.send('steel-event', rendererEventQueue.shift())
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
    rendererReady = false
  })
}

function applyScaleToWindow(s) {
  if (!mainWindow || mainWindow.isDestroyed()) return
  currentScale = s
  const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize
  const w = Math.round(BASE_W * s)
  const h = Math.round(BASE_H * s)
  mainWindow.setResizable(true)
  mainWindow.setSize(w, h, false)
  mainWindow.setResizable(false)
  mainWindow.setPosition(screenW - w - MARGIN, screenH - h - MARGIN, false)
  mainWindow.webContents.send('set-scale', s)
}

function showWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  // Toggle alwaysOnTop to force Windows to re-evaluate window visibility
  // This fixes transparent windows that get "stuck" hidden after auto-hide
  mainWindow.setAlwaysOnTop(false)
  mainWindow.setAlwaysOnTop(true, 'pop-up-menu')
  mainWindow.show()
  mainWindow.blur()
}

function hideWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide()
}

function resetTimers() {
  if (hideTimer) clearTimeout(hideTimer)
  if (quitTimer) clearTimeout(quitTimer)
  hideTimer = setTimeout(() => { hideWindow() }, HIDE_TIMEOUT)
  quitTimer = setTimeout(() => { log('Auto-exit after inactivity'); app.quit() }, QUIT_TIMEOUT)
}

// ---- HTTP server ----
function startServer() {
  server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/api/ping') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ status: 'ok' }))
      return
    }

    if (req.method === 'POST' && req.url === '/api/show') {
      ensureTodayStats()
      showWindow()
      resetTimers()
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
      return
    }

    if (req.method === 'POST' && req.url === '/api/steel-event') {
      if (!String(req.headers['content-type'] || '').startsWith('application/json')) {
        res.writeHead(415); res.end('JSON required')
        return
      }
      let body = ''
      req.on('data', chunk => {
        body += chunk
        if (body.length > 16 * 1024) req.destroy()
      })
      req.on('end', () => {
        try {
          handleSteelEvent(JSON.parse(body))
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true }))
        } catch (err) {
          log(`Invalid event: ${err.message}`)
          res.writeHead(400); res.end('Bad request')
        }
      })
      return
    }
    res.writeHead(404); res.end('Not found')
  })

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      tryPingExisting(currentPort, (alive) => {
        if (alive) {
          if (IS_MANUAL_LAUNCH) requestExistingHud().finally(() => app.quit())
          else app.quit()
        }
        else if (currentPort < STEEL_PORT + 5) { currentPort++; server.listen(currentPort, '127.0.0.1') }
        else app.quit()
      })
    }
  })

  server.listen(currentPort, '127.0.0.1', () => {
    log(`HTTP server on 127.0.0.1:${currentPort}`)
    drainPendingEvents()
    resetTimers()
  })
}

function requestExistingHud() {
  return new Promise(resolve => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      resolve()
    }
    const req = http.request({
      hostname: '127.0.0.1',
      port: STEEL_PORT,
      path: '/api/show',
      method: 'POST',
      timeout: 1000,
    }, (res) => {
      res.resume()
      res.on('end', finish)
    })
    req.on('error', finish)
    req.on('timeout', () => { req.destroy(); finish() })
    req.end()
  })
}

function tryPingExisting(port, cb) {
  const req = http.get(`http://127.0.0.1:${port}/api/ping`, { timeout: 1000 }, (res) => cb(res.statusCode === 200))
  req.on('error', () => cb(false))
  req.on('timeout', () => { req.destroy(); cb(false) })
}

function handleSteelEvent(event) {
  event = normalizeSteelEvent(event)
  ensureTodayStats()
  const stats = applySteelEvent(event)
  if (mainWindow && !mainWindow.isDestroyed()) {
    showWindow()
    const rendererEvent = {
      ...event,
      todayHp: stats.todayHp,
      todayLayers: stats.todayLayers,
      todayChars: stats.todayChars,
    }
    if (rendererReady) {
      mainWindow.webContents.send('steel-event', rendererEvent)
    } else {
      rendererEventQueue.push(rendererEvent)
    }
  }
  resetTimers()
}

function drainPendingEvents() {
  const pending = readPendingEvents()
  if (pending.length === 0) return
  log(`Draining ${pending.length} pending events`)
  for (const event of pending) {
    try {
      handleSteelEvent(event)
    } catch (err) {
      log(`Discarded invalid pending event: ${err.message}`)
    }
  }
  clearPendingEvents()
}

// ---- Tray ----
function buildContextMenu() {
  const cur = readScale()
  const scaleSubmenu = SCALE_OPTIONS.map(s => ({
    label: `${s}x`,
    type: 'radio',
    checked: cur === s,
    click: () => { writeScale(s); applyScaleToWindow(s); buildContextMenu() },
  }))

  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show HUD', click: () => { ensureTodayStats(); showWindow(); resetTimers() } },
    { label: 'Hide HUD', click: () => { hideWindow() } },
    {
      label: '开机自动启动',
      type: 'checkbox',
      checked: isStartAtLoginEnabled(),
      click: (item) => setStartAtLogin(item.checked),
    },
    { label: 'Scale', submenu: scaleSubmenu },
    { label: 'Reset Today', click: () => {
      require('../shared/data').resetToday()
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('stats-reset')
    }},
    { type: 'separator' },
    {
      label: '退出并暂停自动唤醒',
      click: () => {
        explicitQuit = true
        setHookLaunchEnabled(false)
        app.quit()
      },
    },
  ]))
}

function getLoginItemSettingsOptions() {
  return {
    path: process.execPath,
    args: ['--autostart'],
  }
}

function isStartAtLoginEnabled() {
  if (!app.isPackaged) return false
  const settings = app.getLoginItemSettings(getLoginItemSettingsOptions())
  return settings.openAtLogin
}

function setStartAtLogin(enabled) {
  app.setLoginItemSettings({
    ...getLoginItemSettingsOptions(),
    openAtLogin: enabled === true,
  })
  buildContextMenu()
}

function ensureAutostartPath() {
  if (!app.isPackaged) return
  const settings = app.getLoginItemSettings(getLoginItemSettingsOptions())
  if (settings.openAtLogin && settings.path !== process.execPath) {
    log(`Autostart path mismatch: ${settings.path} → ${process.execPath}, re-registering`)
    setStartAtLogin(true)
  }
}

function createTray() {
  const iconPath = path.join(__dirname, '..', '..', 'assets', 'icon.png')
  let icon
  try { icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 }) }
  catch (_) { icon = nativeImage.createEmpty() }
  tray = new Tray(icon)
  tray.setToolTip('钢门 SteelGate')
  buildContextMenu()
  tray.on('click', () => { ensureTodayStats(); showWindow(); resetTimers() })
}

// ---- IPC ----
ipcMain.handle('get-stats', () => { ensureTodayStats(); return readStats() })
ipcMain.handle('get-config', () => STEEL_CONFIG)

ipcMain.on('hud-drag', (_, { dx, dy }) => {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return
  const [x, y] = mainWindow.getPosition()
  mainWindow.setPosition(x + Math.trunc(dx), y + Math.trunc(dy), false)
})

// Renderer: mouse entered/left interactive content → toggle click-through
ipcMain.on('hud-mouse', (_, { entered }) => {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.setIgnoreMouseEvents(entered !== true, { forward: true })
})

// ---- App lifecycle ----
app.whenReady().then(() => {
  if (process.argv.includes('--remove-hooks')) {
    uninstallRuntime()
    app.quit()
    return
  }

  installRuntime(buildRuntimeOptions({
    appRoot: path.join(__dirname, '..', '..'),
    desktopExecutable: process.execPath,
    isPackaged: app.isPackaged,
  }))
  if (process.argv.includes('--install-hooks-only')) {
    app.quit()
    return
  }


  if ((IS_HOOK_LAUNCH || IS_AUTO_START) && !isHookLaunchEnabled()) {
    app.quit()
    return
  }
  if (IS_MANUAL_LAUNCH) setHookLaunchEnabled(true)

  resetSessionStats()
  createWindow()
  createTray()
  ensureAutostartPath()
  startServer()
  if (IS_MANUAL_LAUNCH) {
    mainWindow.once('ready-to-show', () => {
      showWindow()
      resetTimers()
    })
  }
  setTimeout(() => { resetTimers() }, 1000)
})

app.on('window-all-closed', () => {})
app.on('before-quit', () => {
  if (hideTimer) clearTimeout(hideTimer)
  if (quitTimer) clearTimeout(quitTimer)
  if (server && server.listening) server.close()
  if (explicitQuit) log('Manual quit paused hook auto-launch')
})
