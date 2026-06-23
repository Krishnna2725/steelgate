const fs = require('fs')
const path = require('path')
const { PATHS } = require('./config')

const LIFECYCLE_STATE_PATH = path.join(PATHS.home, 'lifecycle-state.json')

const DEFAULT_LIFECYCLE_STATE = {
  hookLaunchEnabled: true,
}

function readLifecycleState(filePath = LIFECYCLE_STATE_PATH) {
  try {
    return {
      ...DEFAULT_LIFECYCLE_STATE,
      ...JSON.parse(fs.readFileSync(filePath, 'utf8')),
    }
  } catch (_) {
    return { ...DEFAULT_LIFECYCLE_STATE }
  }
}

function writeLifecycleState(nextState, filePath = LIFECYCLE_STATE_PATH) {
  const state = { ...readLifecycleState(filePath), ...nextState }
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const temporaryPath = `${filePath}.tmp`
  fs.writeFileSync(temporaryPath, JSON.stringify(state, null, 2), 'utf8')
  fs.renameSync(temporaryPath, filePath)
  return state
}

function isHookLaunchEnabled(filePath = LIFECYCLE_STATE_PATH) {
  return readLifecycleState(filePath).hookLaunchEnabled !== false
}

function setHookLaunchEnabled(enabled, filePath = LIFECYCLE_STATE_PATH) {
  return writeLifecycleState({ hookLaunchEnabled: enabled === true }, filePath)
}

module.exports = {
  DEFAULT_LIFECYCLE_STATE,
  LIFECYCLE_STATE_PATH,
  readLifecycleState,
  writeLifecycleState,
  isHookLaunchEnabled,
  setHookLaunchEnabled,
}
