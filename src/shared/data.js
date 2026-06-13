const fs = require('fs')
const path = require('path')
const { STEEL_CONFIG, PATHS } = require('./config')

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

function ensureHome() {
  ensureDir(PATHS.home)
  ensureDir(path.join(PATHS.home, 'logs'))
  ensureDir(path.join(PATHS.home, 'hooks'))
  ensureDir(PATHS.sounds)
}

function getLocalDateString(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function safeReadJson(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8')
    return JSON.parse(raw)
  } catch (err) {
    if (err.code === 'ENOENT') return null
    // File corrupted — backup and return null
    try {
      const backupPath = filePath.replace(/\.json$/, `.corrupted.${Date.now()}.json`)
      fs.copyFileSync(filePath, backupPath)
      fs.unlinkSync(filePath)
    } catch (_) {}
    return null
  }
}

function safeWriteJson(filePath, data) {
  ensureDir(path.dirname(filePath))
  const tmpPath = filePath + '.tmp'
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8')
  fs.renameSync(tmpPath, filePath)
}

function createEmptyStats(date) {
  return {
    activeDate: date,
    todayLayers: 0,
    todayHp: STEEL_CONFIG.initialHp,
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
}

function readStats() {
  const data = safeReadJson(PATHS.stats)
  if (!data) return null
  return data
}

function writeStats(stats) {
  safeWriteJson(PATHS.stats, stats)
}

function readDailyHistory() {
  const data = safeReadJson(PATHS.dailyHistory)
  if (!data || !Array.isArray(data.days)) {
    return { days: [] }
  }
  return data
}

function writeDailyHistory(history) {
  safeWriteJson(PATHS.dailyHistory, history)
}

function archiveDay(stats) {
  if (!stats || !stats.activeDate) return

  const history = readDailyHistory()

  const record = {
    date: stats.activeDate,
    layers: stats.todayLayers || 0,
    hp: stats.todayHp || STEEL_CONFIG.initialHp,
    chars: stats.todayChars || 0,
    triggers: stats.todayTriggers || 0,
    maxSingleLayers: stats.maxSingleLayers || 0,
    maxSingleChars: stats.maxSingleChars || 0,
    firstTriggerAt: stats.firstTriggerAt || null,
    lastTriggerAt: stats.lastTriggerAt || null,
  }

  const index = history.days.findIndex(day => day.date === record.date)
  if (index >= 0) {
    history.days[index] = record
  } else {
    history.days.push(record)
  }
  history.days.sort((a, b) => a.date.localeCompare(b.date))

  writeDailyHistory(history)
}

function ensureTodayStats() {
  const today = getLocalDateString()
  let stats = readStats()

  if (!stats || !stats.activeDate) {
    const newStats = createEmptyStats(today)
    writeStats(newStats)
    return newStats
  }

  if (stats.activeDate !== today) {
    archiveDay(stats)
    const newStats = createEmptyStats(today)
    writeStats(newStats)
    return newStats
  }

  return stats
}

function applySteelEvent(event) {
  const stats = ensureTodayStats()

  // Defensive: handle null/undefined from race conditions or corruption
  stats.todayLayers = (stats.todayLayers || 0) + event.layers
  stats.todayHp = (stats.todayHp ?? STEEL_CONFIG.initialHp) + event.gainHp
  stats.todayChars = (stats.todayChars || 0) + event.chars
  stats.todayTriggers = (stats.todayTriggers || 0) + 1

  stats.sessionLayers = (stats.sessionLayers || 0) + event.layers
  stats.sessionHpGained = (stats.sessionHpGained || 0) + event.gainHp
  stats.sessionChars = (stats.sessionChars || 0) + event.chars
  stats.sessionTriggers = (stats.sessionTriggers || 0) + 1

  stats.maxSingleLayers = Math.max(stats.maxSingleLayers || 0, event.layers)
  stats.maxSingleChars = Math.max(stats.maxSingleChars || 0, event.chars)

  if (!stats.firstTriggerAt) {
    stats.firstTriggerAt = event.timestamp
  }
  stats.lastTriggerAt = event.timestamp

  writeStats(stats)
  appendEvent(event)

  return stats
}

function appendEvent(event) {
  ensureDir(path.dirname(PATHS.events))
  const line = JSON.stringify(event) + '\n'
  fs.appendFileSync(PATHS.events, line, 'utf8')
}

function readPendingEvents() {
  try {
    const raw = fs.readFileSync(PATHS.pendingEvents, 'utf8')
    return raw
      .split('\n')
      .filter(line => line.trim())
      .map(line => {
        try { return JSON.parse(line) } catch (_) { return null }
      })
      .filter(Boolean)
  } catch (err) {
    return []
  }
}

function writePendingEvent(event) {
  ensureDir(path.dirname(PATHS.pendingEvents))
  const line = JSON.stringify(event) + '\n'
  fs.appendFileSync(PATHS.pendingEvents, line, 'utf8')
}

function clearPendingEvents() {
  try {
    fs.writeFileSync(PATHS.pendingEvents, '', 'utf8')
  } catch (_) {}
}

function resetToday() {
  const today = getLocalDateString()
  const newStats = createEmptyStats(today)
  writeStats(newStats)
  return newStats
}

function resetSessionStats() {
  const stats = ensureTodayStats()
  stats.sessionLayers = 0
  stats.sessionHpGained = 0
  stats.sessionChars = 0
  stats.sessionTriggers = 0
  writeStats(stats)
  return stats
}

module.exports = {
  ensureHome,
  getLocalDateString,
  readStats,
  writeStats,
  readDailyHistory,
  archiveDay,
  ensureTodayStats,
  applySteelEvent,
  appendEvent,
  readPendingEvents,
  writePendingEvent,
  clearPendingEvents,
  resetToday,
  resetSessionStats,
  createEmptyStats,
}
