const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { calculateSteelGain } = require('../src/shared/steel-gain')
const { normalizeSteelEvent } = require('../src/shared/steel-event')
const { buildRuntimeOptions } = require('../src/shared/runtime-install')
const { removeLegacyAutostart } = require('../src/shared/legacy-cleanup')
const { isAcceptedPromptInput, summarizeHookInput } = require('../src/hook/hook-common')
const { countOccurrences, isStandardUserPrompt, normalizePrompt } = require('../src/hook/codex-prompt')

test('steel gain follows the MVP thresholds and cap', () => {
  assert.equal(calculateSteelGain(59).triggered, false)
  assert.deepEqual(calculateSteelGain(60), {
    triggered: true,
    layers: 6,
    gainHp: 300,
    intensity: 0.2,
    capped: false,
  })
  assert.deepEqual(calculateSteelGain(400), {
    triggered: true,
    layers: 30,
    gainHp: 1500,
    intensity: 1,
    capped: true,
  })
})

test('event normalization derives values and drops prompt text', () => {
  const event = normalizeSteelEvent({
    source: 'claude-code',
    chars: 80,
    layers: 999,
    gainHp: 999999,
    prompt: 'this must never be stored',
    timestamp: 1781280000000,
  })

  assert.equal(event.layers, 8)
  assert.equal(event.gainHp, 400)
  assert.equal(event.intensity, 8 / 30)
  assert.equal(Object.hasOwn(event, 'prompt'), false)
})

test('event normalization rejects short and malformed events', () => {
  assert.throws(() => normalizeSteelEvent({ source: 'claude-code', chars: 59 }))
  assert.throws(() => normalizeSteelEvent({ source: 'claude-code', chars: 'many' }))
  assert.throws(() => normalizeSteelEvent({ source: 'browser', chars: 80 }))
})

test('development runtime launches the app entry from the project root', () => {
  const appRoot = path.join('D:', 'work', 'steelgate')
  const options = buildRuntimeOptions({
    appRoot,
    desktopExecutable: 'electron.exe',
    isPackaged: false,
  })

  assert.deepEqual(options.desktopArgs, [path.join(appRoot, 'src', 'app', 'main.js')])
  assert.equal(options.desktopArgs[0].includes(path.join('src', 'app', 'src', 'app')), false)
})

test('legacy autostart cleanup removes the old Windows Run value', () => {
  const calls = []
  const removed = removeLegacyAutostart({
    platform: 'win32',
    execFile: (...args) => calls.push(args),
  })

  assert.equal(removed, true)
  assert.deepEqual(calls[0][0], 'reg.exe')
  assert.deepEqual(calls[0][1], [
    'delete',
    'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
    '/v',
    'SteelGate',
    '/f',
  ])
  assert.equal(removeLegacyAutostart({ platform: 'linux' }), false)
})

test('Codex recognizes standard interactive UserPromptSubmit payloads', () => {
  const prompt = 'a'.repeat(80)
  const interactive = {
    hook_event_name: 'UserPromptSubmit',
    session_id: 'session-1',
    turn_id: 'turn-1',
    transcript_path: 'C:\\temp\\transcript.jsonl',
    prompt,
  }

  assert.equal(isStandardUserPrompt(interactive), true)
  assert.equal(isStandardUserPrompt({ prompt }), false)
  assert.equal(isStandardUserPrompt({ ...interactive, hook_event_name: 'SessionStart' }), false)
  assert.equal(isAcceptedPromptInput({ prompt }, 'claude-code'), true)
})

test('Codex prompt history distinguishes user submissions from background prompts', () => {
  const history = {
    threadA: ['first prompt', 'same prompt'],
    threadB: ['same prompt', 'latest user prompt'],
    global: [],
  }

  assert.equal(countOccurrences(history, 'same prompt'), 2)
  assert.equal(countOccurrences(history, 'latest user prompt\n'), 1)
  assert.equal(countOccurrences(history, 'background startup prompt'), 0)
  assert.equal(normalizePrompt('hello\r\n'), 'hello')
})

test('ignored hook diagnostics never include prompt text', () => {
  const summary = summarizeHookInput({
    hook_event_name: 'SessionStart',
    prompt: 'private prompt text',
  })

  assert.equal(summary.includes('private prompt text'), false)
  assert.equal(summary.includes('"promptChars":19'), true)
})
