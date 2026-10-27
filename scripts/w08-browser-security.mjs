import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const host = '127.0.0.1'
const port = '4174'
const baseUrl = `http://${host}:${port}`
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--mode', 'smoke', '--host', host, '--port', port], {
  stdio: ['ignore', 'pipe', 'pipe'],
})
let serverOutput = ''
let browser
server.stdout.on('data', chunk => { serverOutput += chunk.toString() })
server.stderr.on('data', chunk => { serverOutput += chunk.toString() })

const coachSummary = '<img src=x onerror="window.__w08Xss=1"> 5 < 7 & "quoted"'
const coachRecommendation = '[click](javascript:window.__w08Xss=2) <a href="javascript:window.__w08Xss=3">link</a>'
const plannerSummary = '<script>window.__w08Xss=4</script> Keep <control> as text.'
const plannerRecommendation = '**practice** [unsafe](javascript:window.__w08Xss=5)'
const plannerEvidence = '<svg onload="window.__w08Xss=6"></svg> Evidence & details.'

try {
  await waitForServer()
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  const pageErrors = []
  page.on('pageerror', error => pageErrors.push(error.message))
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' })
  await page.locator('#game').waitFor({ state: 'visible' })
  await page.evaluate(() => { window.__w08Xss = 0 })

  await page.route('**/api/ai/advice', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ summary: coachSummary, recommendation: coachRecommendation, category: 'general' }),
  }))
  await page.route('**/api/ai/training-plan', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      run: { runId: 'run_xss', status: 'completed', stopReason: 'completed', stepCount: 2, providerAttemptCount: 2, toolCallCount: 1, elapsedMs: 1 },
      plan: {
        summary: plannerSummary,
        focus: 'consistency',
        recommendation: plannerRecommendation,
        evidence: [{ id: 'game.outcome', finding: plannerEvidence }],
        confidence: 'medium',
        completed: true,
      },
    }),
  }))

  await page.evaluate(() => window.__brickPulseSmoke?.complete('WON'))
  await page.locator('#ask-ai-coach').click()
  await page.waitForFunction(expected => document.querySelector('#ai-coach-summary')?.textContent === expected, coachSummary)
  await assertInertText(page, '#ai-coach-summary', coachSummary)
  await assertInertText(page, '#ai-coach-recommendation', coachRecommendation)

  await page.locator('#create-training-plan').click()
  await page.waitForFunction(expected => document.querySelector('#training-plan-summary')?.textContent === expected, plannerSummary)
  await assertInertText(page, '#training-plan-summary', plannerSummary)
  await assertInertText(page, '#training-plan-recommendation', plannerRecommendation)
  await assertInertText(page, '#training-plan-evidence li', plannerEvidence)

  assert(await page.evaluate(() => window.__w08Xss) === 0, 'an XSS marker executed')
  assert(await page.locator('script[src^="javascript:"], img, a[href^="javascript:"], svg[onload]').count() === 0, 'hostile response created active DOM')
  assert(pageErrors.length === 0, `browser errors: ${pageErrors.join('; ')}`)
  console.log('PASS T04 real-browser XSS markers remained inert in Coach and Training Planner output')
  console.log('PASS T05 HTML, Markdown, and javascript-link syntax remained literal text')
  console.log('PASS legitimate special text rendered exactly and no marker executed')
} catch (error) {
  console.error(`FAIL W08 browser security: ${error instanceof Error ? error.message : String(error)}`)
  if (serverOutput.trim()) console.error(serverOutput.trim())
  process.exitCode = 1
} finally {
  await browser?.close()
  await stopServer()
}

async function assertInertText(page, selector, expected) {
  const locator = page.locator(selector)
  assert(await locator.textContent() === expected, `${selector} did not preserve exact text`)
  assert(await locator.locator('script, img, a, svg').count() === 0, `${selector} created an active descendant`)
}

async function waitForServer() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(baseUrl, { signal: AbortSignal.timeout(1_000) })
      if (response.ok) return
    } catch {
      // Retry while the local Vite process starts.
    }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error('local Vite server did not become ready')
}

async function stopServer() {
  if (server.exitCode !== null || server.signalCode !== null) return
  const exited = new Promise(resolve => server.once('exit', resolve))
  server.kill('SIGTERM')
  await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 2_000))])
  if (server.exitCode === null && server.signalCode === null) server.kill('SIGKILL')
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}
