const { STEEL_CONFIG } = require('./config')

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function calculateSteelGain(chars) {
  if (chars < STEEL_CONFIG.minTriggerChars) {
    return {
      triggered: false,
      layers: 0,
      gainHp: 0,
      intensity: 0,
      capped: false,
    }
  }

  const rawLayers = Math.floor(chars / STEEL_CONFIG.charsPerLayer)

  const layers = Math.min(rawLayers, STEEL_CONFIG.maxLayersPerTrigger)

  const gainHp = layers * STEEL_CONFIG.hpPerLayer

  const intensity = clamp(
    layers / STEEL_CONFIG.maxLayersPerTrigger,
    0.2,
    1
  )

  return {
    triggered: true,
    layers,
    gainHp,
    intensity,
    capped: rawLayers > STEEL_CONFIG.maxLayersPerTrigger,
  }
}

module.exports = { calculateSteelGain, clamp }
