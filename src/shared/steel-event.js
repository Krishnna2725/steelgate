const { calculateSteelGain } = require('./steel-gain')
const { getLocalDateString } = require('./data')

const ALLOWED_SOURCES = new Set(['claude-code', 'codex', 'test'])

function normalizeSteelEvent(input, now = Date.now()) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Event must be an object')
  }

  const chars = Number(input.chars)
  if (!Number.isSafeInteger(chars) || chars < 0 || chars > 10_000_000) {
    throw new Error('Invalid chars')
  }

  const result = calculateSteelGain(chars)
  if (!result.triggered) {
    throw new Error('Prompt is below trigger threshold')
  }

  if (!ALLOWED_SOURCES.has(input.source)) {
    throw new Error('Invalid source')
  }
  const source = input.source
  const timestamp = Number.isSafeInteger(input.timestamp) && input.timestamp > 0
    ? input.timestamp
    : now

  return {
    date: getLocalDateString(new Date(timestamp)),
    source,
    chars,
    layers: result.layers,
    gainHp: result.gainHp,
    intensity: result.intensity,
    timestamp,
    capped: result.capped,
  }
}

module.exports = { normalizeSteelEvent }
