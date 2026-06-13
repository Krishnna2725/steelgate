#!/usr/bin/env node
/**
 * 钢门 SteelGate — 效果测试脚本
 * 用法: node test.js
 * 前提: SteelGate HUD 正在运行 (npm start)
 */

const http = require('http')

const PORT = 24319
const HOST = '127.0.0.1'

function send(event) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ ...event, timestamp: Date.now() })
    const req = http.request({
      hostname: HOST,
      port: PORT,
      path: '/api/steel-event',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      timeout: 2000,
    }, (res) => {
      let body = ''
      res.on('data', c => body += c)
      res.on('end', () => resolve(body))
    })
    req.on('error', (e) => reject(e))
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')) })
    req.write(payload)
    req.end()
  })
}

function ping() {
  return new Promise((resolve) => {
    const req = http.get(`http://${HOST}:${PORT}/api/ping`, { timeout: 1000 }, (res) => {
      resolve(res.statusCode === 200)
    })
    req.on('error', () => resolve(false))
    req.on('timeout', () => { req.destroy(); resolve(false) })
  })
}

const SCENARIOS = [
  {
    name: '小叠钢 (+6层 / 300 HP)',
    desc: '60字 prompt，最低触发',
    event: { source: 'test', chars: 60, layers: 6, gainHp: 300, intensity: 0.2, capped: false },
  },
  {
    name: '中叠钢 (+15层 / 750 HP)',
    desc: '150字 prompt，中等强度',
    event: { source: 'test', chars: 150, layers: 15, gainHp: 750, intensity: 0.5, capped: false },
  },
  {
    name: '大叠钢 (+25层 / 1250 HP)',
    desc: '250字 prompt，高强度',
    event: { source: 'test', chars: 250, layers: 25, gainHp: 1250, intensity: 0.83, capped: false },
  },
  {
    name: '封顶叠钢 (+30层 / 1500 HP)',
    desc: '400字 prompt，触发上限',
    event: { source: 'test', chars: 400, layers: 30, gainHp: 1500, intensity: 1.0, capped: true },
  },
  {
    name: '超级封顶 (+30层 / 1500 HP)',
    desc: '600字 prompt，超长封顶',
    event: { source: 'test', chars: 600, layers: 30, gainHp: 1500, intensity: 1.0, capped: true },
  },
  {
    name: '连击 x5',
    desc: '快速连续触发 5 次中等叠钢',
    event: { source: 'test', chars: 150, layers: 15, gainHp: 750, intensity: 0.5, capped: false },
    repeat: 5,
    delay: 300,
  },
  {
    name: '连击 x10',
    desc: '快速连续触发 10 次小叠钢',
    event: { source: 'test', chars: 80, layers: 8, gainHp: 400, intensity: 0.27, capped: false },
    repeat: 10,
    delay: 200,
  },
  {
    name: 'Codex 来源测试',
    desc: '模拟 Codex 触发',
    event: { source: 'codex', chars: 200, layers: 20, gainHp: 1000, intensity: 0.67, capped: false },
  },
]

async function fire(scenario) {
  const times = scenario.repeat || 1
  for (let i = 0; i < times; i++) {
    try {
      const res = await send(scenario.event)
      process.stdout.write(`  [${i + 1}/${times}] `)
      console.log(res)
    } catch (e) {
      console.log(`  [${i + 1}/${times}] 失败: ${e.message}`)
      break
    }
    if (scenario.delay && i < times - 1) {
      await new Promise(r => setTimeout(r, scenario.delay))
    }
  }
}

function printMenu() {
  console.log('')
  console.log('╔══════════════════════════════════════╗')
  console.log('║   钢门 SteelGate — 效果测试面板      ║')
  console.log('╠══════════════════════════════════════╣')
  SCENARIOS.forEach((s, i) => {
    const num = String(i + 1).padStart(2, ' ')
    console.log(`║  ${num}. ${s.name.padEnd(28)} ║`)
    console.log(`║      ${s.desc.padEnd(28)} ║`)
    if (i < SCENARIOS.length - 1) console.log('║                                      ║')
  })
  console.log('╠══════════════════════════════════════╣')
  console.log('║  0. 退出                             ║')
  console.log('╚══════════════════════════════════════╝')
  console.log('')
}

async function main() {
  // Check connection
  const alive = await ping()
  if (!alive) {
    console.log('')
    console.log('  ⚠ SteelGate HUD 未运行！')
    console.log('  请先执行 npm start 启动 HUD')
    console.log('')
    process.exit(1)
  }

  const readline = require('readline')
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

  printMenu()

  const prompt = () => {
    rl.question('选择 (1-' + SCENARIOS.length + '): ', async (answer) => {
      const n = parseInt(answer.trim())
      if (n === 0) {
        console.log('再见！')
        rl.close()
        process.exit(0)
      }
      if (n < 1 || n > SCENARIOS.length) {
        console.log('无效选择')
        prompt()
        return
      }
      const scenario = SCENARIOS[n - 1]
      console.log(`\n触发: ${scenario.name}`)
      await fire(scenario)
      prompt()
    })
  }

  prompt()
}

main()
