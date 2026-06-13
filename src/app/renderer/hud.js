/* ========================================
   钢门 SteelGate HUD — hud.js
   ======================================== */

// ---- State ----
let config = {
  initialHp: 1000,
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
  memeEnabled: true,
  memeMinLayers: 15,
}
let todayHp = config.initialHp
let todayLayers = 0
let orbState = 'READY'
let orbTimer = null
let lastTriggerAt = 0
let configReady = false
const pendingSteelEvents = []

// ---- DOM refs ----
const hudEl = document.getElementById('hud')
const mainIcon = document.getElementById('main-icon')
const iconGhost = document.getElementById('icon-ghost')
const orb = document.getElementById('orb')
const layerBadge = document.getElementById('layer-badge')
const healthBarFill = document.getElementById('health-bar-fill')
const healthBarSegments = document.getElementById('health-bar-segments')
const healthBar = document.getElementById('health-bar')
const hpTooltip = document.getElementById('hp-tooltip')
const iconArea = document.getElementById('icon-area')
const healthBarContainer = document.getElementById('health-bar-container')

// Icon ghost background
mainIcon.addEventListener('load', () => { iconGhost.style.backgroundImage = `url(${mainIcon.src})` })
if (mainIcon.complete) iconGhost.style.backgroundImage = `url(${mainIcon.src})`

// ---- Scale: CSS zoom + window resize (both coordinated by main process) ----
function applyScale(s) {
  hudEl.style.setProperty('--hud-zoom', s)
}

function applyConfig(nextConfig) {
  config = { ...config, ...nextConfig }
  hudEl.style.setProperty('--health-bar-width', `${config.healthBarWidth}px`)
  orb.style.setProperty('--orb-respawn-duration', `${config.orbRespawnDurationMs}ms`)
  orb.style.setProperty('--orb-charge-duration', `${config.orbMaxChargeDurationMs}ms`)
}

// ---- Meme pools ----
const MEME_NORMAL = [
  '叠钢！', '钢门！', '入钢门！', '钢起来了', '肉起来了',
  '发育成功', '这也能叠？', '再来一层', '血量健康', '开始变厚',
  '厚礼蟹', '有钢味了', '这一铛舒服了', '心跳了一下', '钢信徒集合',
]
const MEME_BIG = [
  '大钢！', '钢化你心', '这波真能叠', '别走，让我叠一下',
  '项目可以烂，钢不能不叠', '血条开始不讲道理', '这 prompt 有坦度',
  '你这个需求很肉', '好厚的 prompt', '钢味溢出来了',
]
const MEME_CAPPED = [
  '巨钢！', '满层开铛！', '这一口太大了', '万血预备',
  '血条密起来了', '钢门大开', '心之钢门！', '这把真叠爽了',
  '诚信互刷成功', '人可以走，钢得留下',
]
const MEME_SARCASTIC = [
  '又在跟 AI 许愿', '这需求，坦克看了都沉默', '产品味有点重',
  '这 prompt 比血条还长', 'AI 看完也想出肉', '代码还没动，血先厚了',
  '先别管能不能跑，叠到了', '你这是写需求，还是开团？',
]

function randomFrom(arr) { return arr[Math.floor(Math.random() * arr.length)] }

function pickMemeText(layers, capped) {
  if (!config.memeEnabled || layers < config.memeMinLayers) return null
  if (capped) { return Math.random() > 0.5 ? null : randomFrom(MEME_CAPPED) }
  if (layers >= 20) { return Math.random() > 0.3 ? null : randomFrom([...MEME_BIG, ...MEME_NORMAL]) }
  return Math.random() > 0.25 ? null : randomFrom(MEME_NORMAL)
}

function maybeUseSarcasticMeme(t) {
  if (!t) return null
  return Math.random() < 0.08 ? randomFrom(MEME_SARCASTIC) : t
}

// ---- Audio ----
const audioPath = '../../../assets/sounds/trigger.mp3'

function playSound(intensity) {
  if (!config.soundEnabled) return
  try {
    const a = new Audio(audioPath)
    a.volume = Math.min(1, Math.max(0, lerp(config.triggerMinVolume, config.triggerMaxVolume, intensity) * config.soundVolume))
    a.play().catch(() => {})
  } catch (_) {}
}

// ---- Utility ----
function lerp(a, b, t) { return a + (b - a) * Math.min(1, Math.max(0, t)) }

// ---- Health bar ----
function updateHealthBar(hp) {
  todayHp = hp
  const seg = Math.max(1, Math.ceil(hp / config.hpPerSegment))
  healthBarSegments.style.setProperty('--segment-width', (config.healthBarWidth / seg) + 'px')
  hpTooltip.textContent = `当前血量：${hp} HP`
}

// ---- Layer badge ----
function updateLayerBadge(layers) {
  todayLayers = layers
  layerBadge.textContent = layers > 999 ? '999+' : String(layers)
}

// ---- Icon ghost ----
function triggerGhost(intensity) {
  const gs = lerp(config.triggerMinGhostScale, config.triggerMaxGhostScale, intensity)
  const go = lerp(0.22, 0.55, intensity)
  const gd = lerp(260, 520, intensity)
  iconGhost.style.setProperty('--ghost-scale-target', gs)
  iconGhost.style.setProperty('--ghost-opacity-start', go)
  iconGhost.style.setProperty('--ghost-duration', gd + 'ms')
  iconGhost.classList.remove('active'); void iconGhost.offsetWidth; iconGhost.classList.add('active')
  mainIcon.classList.remove('trigger-bounce'); void mainIcon.offsetWidth; mainIcon.classList.add('trigger-bounce')
  setTimeout(() => { iconGhost.classList.remove('active'); mainIcon.classList.remove('trigger-bounce') }, gd + 50)
}

// ---- Jump text (+N层 at icon bottom-right, meme above health bar) ----
function showJumpText(layers, intensity) {
  const container = document.getElementById('jump-container')

  // +N层: centered on icon
  const jumpFs = lerp(22, 36, intensity)
  const jumpDur = lerp(3000, 4000, intensity)
  const iconRect = iconArea.getBoundingClientRect()
  const jx = iconRect.left + iconRect.width / 2
  const jy = iconRect.top + iconRect.height / 2

  const je = document.createElement('div')
  je.className = 'jump-text'
  je.textContent = `+${layers}层`
  je.style.left = jx + 'px'
  je.style.top = jy + 'px'
  je.style.setProperty('--jump-font-size', jumpFs + 'px')
  je.style.setProperty('--jump-distance', '-10px')
  je.style.setProperty('--jump-total', '-16px')
  je.style.setProperty('--jump-duration', jumpDur + 'ms')
  je.style.transform = 'translate(-50%, -50%)'
  container.appendChild(je)
  setTimeout(() => je.remove(), jumpDur + 100)

  // Meme: position above health bar, bigger, with random tilt
  let mt = pickMemeText(layers, layers >= 30)
  mt = maybeUseSarcasticMeme(mt)
  if (mt) {
    const memeFs = lerp(16, 22, intensity)
    const memeDur = lerp(3000, 4000, intensity)
    const hbRect = healthBar.getBoundingClientRect()
    const mx = hbRect.left + hbRect.width / 2
    const my = hbRect.top - 28  // moved up to avoid overlapping health bar
    const tilt = (Math.random() - 0.5) * 12 // random -6deg to +6deg

    const me = document.createElement('div')
    me.className = 'meme-text'
    me.textContent = mt
    me.style.left = mx + 'px'
    me.style.top = my + 'px'
    me.style.fontSize = memeFs + 'px'
    me.style.setProperty('--jump-duration', memeDur + 'ms')
    me.style.transform = `translateX(-50%) rotate(${tilt}deg)`
    container.appendChild(me)
    setTimeout(() => me.remove(), memeDur + 100)
  }
}

// ---- Orb ----
function updateOrbState() {
  if (orbState !== 'READY') return
  const el = Date.now() - lastTriggerAt
  if (el > 0 && el < config.orbMaxChargeDurationMs) {
    const ap = Math.min(1, Math.max(0, el / config.orbRespawnDurationMs))
    const cp = Math.min(1, Math.max(0, el / config.orbMaxChargeDurationMs))
    orb.style.setProperty('--orb-opacity', ap)
    orb.style.setProperty('--orb-scale', lerp(config.orbMinScale, config.orbMaxScale, cp))
    if (ap < 1 || cp < 1) requestAnimationFrame(updateOrbState)
  }
}

function triggerOrbDissolve() {
  orbState = 'TRIGGERED'
  orb.classList.add('dissolving'); orb.classList.remove('recharging')
  clearTimeout(orbTimer)
  orbTimer = setTimeout(() => {
    orb.classList.remove('dissolving'); orb.classList.add('recharging')
    orb.style.setProperty('--orb-opacity', '0'); orb.style.setProperty('--orb-scale', String(config.orbMinScale))
    orbState = 'RECHARGE'; void orb.offsetWidth
    orb.style.setProperty('--orb-opacity', '1'); orb.style.setProperty('--orb-scale', String(config.orbMaxScale))
    orbTimer = setTimeout(() => {
      orb.classList.remove('recharging'); orbState = 'READY'
      orb.style.setProperty('--orb-opacity', '1'); orb.style.setProperty('--orb-scale', String(config.orbMaxScale))
    }, config.orbMaxChargeDurationMs)
  }, 500)
}

// ---- Main event handler ----
function handleSteelEvent(event) {
  updateLayerBadge(event.todayLayers || (todayLayers + event.layers))
  updateHealthBar(event.todayHp || (todayHp + event.gainHp))
  triggerGhost(event.intensity)
  showJumpText(event.layers, event.intensity)
  playSound(event.intensity)
  triggerOrbDissolve()
  lastTriggerAt = Date.now()
  requestAnimationFrame(updateOrbState)
}

function handleStatsReset() {
  todayHp = config.initialHp; todayLayers = 0
  updateLayerBadge(0); updateHealthBar(config.initialHp)
  orbState = 'READY'
  orb.classList.remove('dissolving', 'recharging')
  orb.style.setProperty('--orb-opacity', '1'); orb.style.setProperty('--orb-scale', '1')
  clearTimeout(orbTimer)
}

// ---- Drag (icon area only, movementX/Y) ----
let isDragging = false

iconArea.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return
  isDragging = true
  e.preventDefault()
})

document.addEventListener('mousemove', (e) => {
  if (!isDragging || !window.steelAPI) return
  if (e.movementX !== 0 || e.movementY !== 0) {
    window.steelAPI.startDrag(e.movementX, e.movementY)
  }
})

document.addEventListener('mouseup', () => { isDragging = false })

// ---- Click-through toggle (interactive content disables ignoreMouseEvents) ----
function setupInteractive(el) {
  el.addEventListener('mouseenter', () => { if (window.steelAPI) window.steelAPI.setMouseOver(true) })
  el.addEventListener('mouseleave', () => { if (window.steelAPI) window.steelAPI.setMouseOver(false) })
}
setupInteractive(iconArea)
setupInteractive(healthBarContainer)

// ---- Tooltip ----
healthBarContainer.addEventListener('mouseenter', () => { hpTooltip.style.opacity = '1' })
healthBarContainer.addEventListener('mouseleave', () => { hpTooltip.style.opacity = '0' })
document.addEventListener('mousemove', (e) => {
  if (hpTooltip.style.opacity === '1') {
    hpTooltip.style.left = e.clientX + 'px'
    hpTooltip.style.top = (e.clientY - 24) + 'px'
  }
})

// ---- Init ----
async function boot() {
  if (!window.steelAPI) return
  window.steelAPI.onSteelEvent(event => {
    if (configReady) handleSteelEvent(event)
    else pendingSteelEvents.push(event)
  })
  try {
    applyConfig(await window.steelAPI.getConfig())
  } catch (_) {
    applyConfig(config)
  }
  configReady = true
  while (pendingSteelEvents.length > 0) handleSteelEvent(pendingSteelEvents.shift())
  todayHp = config.initialHp
  updateHealthBar(todayHp)
  updateLayerBadge(0)
  window.steelAPI.onScale(applyScale)
  window.steelAPI.onStatsReset(handleStatsReset)
  try {
    const s = await window.steelAPI.getStats()
    if (s) {
      todayHp = s.todayHp ?? config.initialHp
      todayLayers = s.todayLayers || 0
      updateHealthBar(todayHp)
      updateLayerBadge(todayLayers)
    }
  } catch (_) {}
}

boot()
