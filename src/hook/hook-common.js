const http = require('http')
const { spawn } = require('child_process')
const { STEEL_PORT } = require('../shared/config')
const { calculateSteelGain } = require('../shared/steel-gain')
const { writePendingEvent, ensureTodayStats, getLocalDateString } = require('../shared/data')
const { STEEL_CONFIG } = require('../shared/config')
const { log } = require('../shared/logger')

function runHook(source) {
  let data = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', chunk => { data += chunk })
  process.stdin.on('end', () => {
    try {
      processInput(data, source)
    } catch (err) {
      log(`Hook error: ${err.message}`)
      process.exit(0)
    }
  })

  // Safety: if stdin never closes, exit after 3s
  setTimeout(() => process.exit(0), 4500)
}

function processInput(rawData, source) {
  let input
  try {
    input = JSON.parse(rawData)
  } catch (_) {
    process.exit(0)
  }

  const prompt = input.prompt || ''
  const chars = prompt.length

  const result = calculateSteelGain(chars)
  if (!result.triggered) {
    process.exit(0)
  }

  ensureTodayStats()

  const event = {
    date: getLocalDateString(),
    source,
    chars,
    layers: result.layers,
    gainHp: result.gainHp,
    intensity: result.intensity,
    timestamp: Date.now(),
    capped: result.capped,
  }

  deliverEvent(event)
}

async function deliverEvent(event) {
  if (await sendToHud(event)) {
    process.exit(0)
  }

  launchHud()

  for (const delay of [300, 700, 1200]) {
    await wait(delay)
    if (await sendToHud(event)) {
      process.exit(0)
    }
  }

  writePendingEvent(event)
  process.exit(0)
}

function launchHud() {
  const executable = STEEL_CONFIG.desktopExecutable
  const args = Array.isArray(STEEL_CONFIG.desktopArgs) ? STEEL_CONFIG.desktopArgs : []
  if (!executable) {
    log('HUD launch configuration is missing; reinstall SteelGate')
    return false
  }

  try {
    const child = spawn(executable, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    })
    child.unref()
    return true
  } catch (err) {
    log(`Failed to launch HUD: ${err.message}`)
    return false
  }
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function sendToHud(event) {
  return new Promise(resolve => {
    let settled = false
    const finish = (success) => {
      if (settled) return
      settled = true
      resolve(success)
    }

  const payload = JSON.stringify(event)
  const options = {
    hostname: '127.0.0.1',
    port: STEEL_PORT,
    path: '/api/steel-event',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
    },
    timeout: 500,
  }

  const req = http.request(options, (res) => {
      res.resume()
      finish(res.statusCode === 200)
  })

    req.on('error', () => finish(false))
    req.on('timeout', () => { req.destroy(); finish(false) })

  req.write(payload)
  req.end()
  })
}

module.exports = { runHook, processInput, sendToHud, launchHud }
