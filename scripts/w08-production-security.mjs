import { readFile, readdir } from 'node:fs/promises'
import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { createAdviceService } from '../dist-server/server/ai/advice-service.js'
import { FakeAiAdviceProvider } from '../dist-server/server/ai/fake-provider.js'
import { createApp, createNodeHttpHandler } from '../dist-server/server/app.js'
import { createProductionHttpHandler, PRODUCTION_CSP } from '../dist-server/server/production-server.js'

const provider = new FakeAiAdviceProvider({ mode: 'success', advice: { summary: 'Production fake advice.', recommendation: 'Keep the paddle centered.', category: 'consistency' } })
const syntheticServerConfiguration = Object.freeze({ apiKey: 'W08_SERVER_SECRET_DO_NOT_EXPOSE' })
let syntheticServerConfigurationLoaded = false
let plannerCalls = 0
const planner = {
  async createTrainingPlan() {
    plannerCalls += 1
    syntheticServerConfigurationLoaded = syntheticServerConfiguration.apiKey.length > 0
    return {
      kind: 'completed',
      run: { runId: 'production_fake', status: 'completed', stopReason: 'completed', stepCount: 2, providerAttemptCount: 2, toolCallCount: 1, elapsedMs: 1 },
      plan: { summary: 'Production fake plan.', focus: 'consistency', recommendation: 'Repeat the clear.', evidence: [{ id: 'game.outcome', finding: 'Outcome: WON.' }], confidence: 'high', completed: true },
    }
  },
}
const api = createNodeHttpHandler(createApp(createAdviceService(provider), planner))
const production = createServer(createProductionHttpHandler(api, resolve('dist')))
let controlledRequests = 0
const controlled = createServer((_request, response) => {
  controlledRequests += 1
  response.writeHead(200, { 'content-type': 'text/javascript' })
  response.end('window.__w08CspExecuted = true')
})
let browser

try {
  await listen(production)
  await listen(controlled)
  const productionPort = production.address().port
  const controlledPort = controlled.address().port
  const baseUrl = `http://127.0.0.1:${productionPort}`
  const controlledUrl = `http://127.0.0.1:${controlledPort}/reachable.js`

  const reachable = await fetch(controlledUrl)
  assert(reachable.status === 200, 'controlled CSP resource was not independently reachable')
  const index = await fetch(baseUrl)
  assert(index.status === 200, 'production index did not return 200')
  assert(index.headers.get('content-security-policy') === PRODUCTION_CSP, 'production CSP header mismatch')
  assert(index.headers.get('x-content-type-options') === 'nosniff', 'nosniff header missing')
  assert(index.headers.get('referrer-policy') === 'no-referrer', 'referrer policy missing')
  assert(index.headers.get('x-frame-options') === 'DENY', 'frame protection missing')

  await assertSecretFreeBuild()
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  const consoleMessages = []
  const pageErrors = []
  page.on('console', message => consoleMessages.push(message.text()))
  page.on('pageerror', error => pageErrors.push(error.message))
  const navigation = await page.goto(baseUrl, { waitUntil: 'domcontentloaded' })
  assert(navigation?.status() === 200, 'production browser navigation failed')
  await page.locator('#game').waitFor({ state: 'visible' })
  assert(await page.locator('#game').evaluate(element => element.width === 640 && element.height === 480), 'production game canvas contract failed')
  await page.keyboard.press('Space')

  const validSummary = { outcome: 'WON', score: 320, bricksDestroyed: 32, livesRemaining: 3, livesLost: 0, durationSeconds: 30 }
  const apiResults = await page.evaluate(async summary => {
    const advice = await fetch('/api/ai/advice', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(summary) })
    const plan = await fetch('/api/ai/training-plan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(summary) })
    return { adviceStatus: advice.status, advice: await advice.json(), planStatus: plan.status, plan: await plan.json() }
  }, validSummary)
  assert(apiResults.adviceStatus === 200 && apiResults.advice.summary === 'Production fake advice.', 'production Coach API positive control failed')
  assert(apiResults.planStatus === 200 && apiResults.plan.plan.summary === 'Production fake plan.', 'production Planner API positive control failed')
  assert(provider.providerCallCount === 1 && plannerCalls === 1, 'production fake services had unexpected call counts')
  assert(syntheticServerConfigurationLoaded, 'isolated server did not load the synthetic configuration marker')
  assert(!JSON.stringify(apiResults).includes(syntheticServerConfiguration.apiKey), 'synthetic server configuration leaked into an HTTP response')

  await page.evaluate(url => {
    window.__w08CspExecuted = false
    const script = document.createElement('script')
    script.src = url
    document.body.append(script)
  }, controlledUrl)
  await page.waitForTimeout(250)
  assert(await page.evaluate(() => window.__w08CspExecuted) === false, 'CSP-blocked script executed')
  assert(controlledRequests === 1, 'browser unexpectedly fetched the CSP-blocked resource')
  assert(consoleMessages.some(message => /content security policy|script-src/i.test(message)), 'browser did not report a CSP violation')
  assert(pageErrors.length === 0, `unexpected production page errors: ${pageErrors.join('; ')}`)

  console.log('PASS production build served with exact security headers')
  console.log('PASS production game and deterministic Coach/Planner API controls')
  console.log('PASS controlled reachable cross-origin script blocked by active CSP')
  console.log('PASS production assets contain no credential/synthetic-secret markers')
  console.log('PASS isolated synthetic server configuration loaded without entering HTTP output')
} catch (error) {
  console.error(`FAIL W08 production security: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
} finally {
  await browser?.close()
  await close(production)
  await close(controlled)
}

async function assertSecretFreeBuild() {
  const assetNames = await readdir(resolve('dist', 'assets'))
  const files = [resolve('dist', 'index.html'), ...assetNames.map(name => resolve('dist', 'assets', name))]
  const forbidden = [/GEMINI_API_KEY/i, /AIza[0-9A-Za-z_-]{20,}/, /W08_SERVER_SECRET_DO_NOT_EXPOSE/]
  for (const file of files) {
    const content = await readFile(file, 'utf8')
    for (const pattern of forbidden) assert(!pattern.test(content), `forbidden marker found in ${file}`)
  }
}

function listen(server) {
  return new Promise((resolvePromise, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolvePromise)
  })
}

function close(server) {
  if (!server.listening) return Promise.resolve()
  return new Promise(resolvePromise => server.close(resolvePromise))
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}
