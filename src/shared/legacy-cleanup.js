const { execFileSync } = require('child_process')

const AUTOSTART_REG_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'
const AUTOSTART_REG_NAME = 'SteelGate'

function removeLegacyAutostart({
  platform = process.platform,
  execFile = execFileSync,
} = {}) {
  if (platform !== 'win32') return false

  try {
    execFile('reg.exe', [
      'delete',
      AUTOSTART_REG_KEY,
      '/v',
      AUTOSTART_REG_NAME,
      '/f',
    ], { stdio: 'ignore', windowsHide: true })
    return true
  } catch (_) {
    return false
  }
}

module.exports = { removeLegacyAutostart }
