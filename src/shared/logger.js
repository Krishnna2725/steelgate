const fs = require('fs')
const path = require('path')
const { PATHS } = require('./config')

function log(message) {
  const timestamp = new Date().toISOString()
  const line = `[${timestamp}] ${message}\n`
  try {
    const logDir = path.dirname(PATHS.logs)
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true })
    }
    fs.appendFileSync(PATHS.logs, line, 'utf8')
  } catch (_) {
    // Logger must never throw
  }
}

module.exports = { log }
