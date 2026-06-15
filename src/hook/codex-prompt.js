const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')

const CODEX_GLOBAL_STATE = path.join(os.homedir(), '.codex', '.codex-global-state.json')
const CONSUMED_STATE = path.join(os.homedir(), '.steelgate', 'codex-prompts.json')

function claimCodexPrompt(input) {
  if (!isStandardUserPrompt(input)) return false

  const globalState = readJson(CODEX_GLOBAL_STATE)
  const promptHistory = globalState?.['electron-persisted-atom-state']?.['prompt-history']
  if (!promptHistory || typeof promptHistory !== 'object') {
    // Codex CLI and older Codex versions may not have desktop prompt history.
    return true
  }

  const prompt = normalizePrompt(input.prompt)
  const occurrences = countOccurrences(promptHistory, prompt)
  if (occurrences === 0) return false

  const hash = crypto.createHash('sha256').update(prompt).digest('hex')
  const consumed = readJson(CONSUMED_STATE) || {}
  if ((consumed[hash] || 0) >= occurrences) return false

  consumed[hash] = occurrences
  writeJsonAtomic(CONSUMED_STATE, trimConsumedState(consumed))
  return true
}

function isStandardUserPrompt(input) {
  return input?.hook_event_name === 'UserPromptSubmit'
    && typeof input.prompt === 'string'
    && typeof input.session_id === 'string'
    && input.session_id.length > 0
    && typeof input.turn_id === 'string'
    && input.turn_id.length > 0
}

function countOccurrences(promptHistory, prompt) {
  const normalizedPrompt = normalizePrompt(prompt)
  let count = 0
  for (const value of Object.values(promptHistory)) {
    if (!Array.isArray(value)) continue
    for (const item of value) {
      if (typeof item === 'string' && normalizePrompt(item) === normalizedPrompt) count++
    }
  }
  return count
}

function normalizePrompt(prompt) {
  return String(prompt).replace(/\r\n/g, '\n').trim()
}

function trimConsumedState(consumed) {
  const entries = Object.entries(consumed)
  return Object.fromEntries(entries.slice(Math.max(0, entries.length - 200)))
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch (_) {
    return null
  }
}

function writeJsonAtomic(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const tmp = filePath + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(data), 'utf8')
  fs.renameSync(tmp, filePath)
}

module.exports = {
  claimCodexPrompt,
  isStandardUserPrompt,
  countOccurrences,
  normalizePrompt,
}
