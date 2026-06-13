const { spawn } = require('child_process')
const path = require('path')

const hook = path.join(__dirname, '..', 'src', 'hook', 'claude-hook.js')
const child = spawn(process.execPath, [hook], { stdio: ['pipe', 'inherit', 'inherit'] })
child.stdin.end(JSON.stringify({ prompt: 'a'.repeat(80) }))
child.on('exit', code => process.exit(code || 0))
