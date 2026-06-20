const path = require('path')
const os = require('os')
const fs = require('fs')

const STEEL_HOME = path.join(os.homedir(), '.steelgate')
const CONFIG_PATH = path.join(STEEL_HOME, 'config.json')

const DEFAULT_CONFIG = {
  initialHp: 1000,

  minTriggerChars: 60,
  charsPerLayer: 10,
  hpPerLayer: 10,
  maxLayersPerTrigger: 30,

  hpPerSegment: 500,
  healthBarWidth: 220,

  orbRespawnDurationMs: 10000,
  orbMaxChargeDurationMs: 60000,

  orbMinScale: 0.75,
  orbMaxScale: 1.28,

  triggerMinGhostScale: 1.18,
  triggerMaxGhostScale: 2.05,

  triggerMinVolume: 0.35,
  triggerMaxVolume: 0.9,

  soundEnabled: true,
  soundVolume: 1,
  autoHideMs: 1800000,
  autoExitMs: 3600000,
  memeEnabled: true,
  memeMinLayers: 15,
  desktopExecutable: null,
  desktopArgs: [],
}

function readUserConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
  } catch (_) {
    return {}
  }
}

const STEEL_CONFIG = { ...DEFAULT_CONFIG, ...readUserConfig() }
const STEEL_PORT = 24319

const PATHS = {
  home: STEEL_HOME,
  config: CONFIG_PATH,
  stats: path.join(STEEL_HOME, 'stats.json'),
  dailyHistory: path.join(STEEL_HOME, 'daily-history.json'),
  events: path.join(STEEL_HOME, 'events.ndjson'),
  pendingEvents: path.join(STEEL_HOME, 'pending-events.ndjson'),
  logs: path.join(STEEL_HOME, 'logs', 'steelgate.log'),
  hooks: path.join(STEEL_HOME, 'hooks'),
  assets: path.join(STEEL_HOME, 'assets'),
  sounds: path.join(STEEL_HOME, 'assets', 'sounds'),
}

module.exports = { DEFAULT_CONFIG, STEEL_CONFIG, STEEL_PORT, PATHS }
