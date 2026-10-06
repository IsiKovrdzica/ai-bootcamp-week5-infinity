import { access } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const host = process.env.SMOKE_HOST ?? '127.0.0.1'
const port = process.env.SMOKE_PORT ?? '4173'
const baseUrl = (process.env.SMOKE_URL ?? `http://${host}:${port}`).replace(/\/+$/, '')
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--mode', 'smoke', '--host', host, '--port', port], {
  stdio: ['ignore', 'pipe', 'pipe'],
})

let serverOutput = ''
let browser
server.stdout.on('data', (chunk) => {
  serverOutput += chunk.toString()
})
server.stderr.on('data', (chunk) => {
  serverOutput += chunk.toString()
})

const checks = [
  ['page loads', async (page) => {
    assert(await page.title() === 'BrickPulse', 'page title was not BrickPulse')
    assert((await page.locator('h1').textContent())?.trim() === 'BrickPulse', 'BrickPulse heading was not visible')
  }],
  ['Canvas contract and READY state', async (page) => {
    const canvas = page.locator('#game')
    assert(await canvas.evaluate((element) => element.width === 640 && element.height === 480), 'Canvas must be 640x480')
    const ball = await findBallCenter(page)
    assert(ball !== null, 'READY ball was not rendered')
    assert(await hasPaddleAt(page, 320), 'READY paddle was not rendered at the initial position')
    assert(await page.locator('#ai-coach').isHidden(), 'coach must be unavailable during READY')
  }],
  ['Space starts the ball', async (page) => {
    const before = await findBallCenter(page)
    await page.keyboard.press('Space')
    await page.waitForFunction((previous) => {
      const current = window.__brickPulseBallCenter?.()
      return current && Math.hypot(current.x - previous.x, current.y - previous.y) > 8
    }, before, { timeout: 3000 })
  }],
  ['ArrowRight moves the paddle', async (page) => {
    const before = await getPaddleCenter(page)
    await page.keyboard.down('ArrowRight')
    await page.waitForTimeout(250)
    await page.keyboard.up('ArrowRight')
    await page.waitForFunction((previousX) => {
      const current = window.__brickPulsePaddleCenter?.()
      return current !== null && current > previousX + 20
    }, before, { timeout: 2000 })
  }],
  ['AI coach stays explicit, renders safe states, and clears on restart', async (page) => {
    let requestCount = 0
    const queuedResponses = [
      {
        status: 200,
        body: {
          summary: 'You completed the wall.',
          recommendation: 'Track the next return earlier.',
          category: 'consistency',
        },
      },
      { status: 503, body: { error: { code: 'AI_ADVICE_UNAVAILABLE' } } },
    ]
    await page.route('**/api/ai/advice', async (route) => {
      requestCount += 1
      const response = queuedResponses.shift()
      assert(response !== undefined, 'unexpected additional advice request')
      await delay(100)
      await route.fulfill({
        status: response.status,
        contentType: 'application/json',
        body: JSON.stringify(response.body),
      })
    })

    const coach = page.locator('#ai-coach')
    const button = page.locator('#ask-ai-coach')
    assert(await coach.isHidden(), 'coach must be unavailable during RUNNING')

    await page.evaluate(() => window.__brickPulseSmoke?.complete('WON'))
    await coach.waitFor({ state: 'visible', timeout: 1000 })
    assert(await button.isEnabled(), 'coach button must be enabled while idle')
    assert(requestCount === 0, 'terminal transition must not request advice automatically')

    await button.click()
    await page.waitForFunction(() => document.querySelector('#ai-coach-status')?.textContent === 'ANALYZING...')
    assert(await button.isDisabled(), 'coach button must be disabled while pending')
    await page.waitForFunction(() => document.querySelector('#ai-coach-summary')?.textContent === 'You completed the wall.')
    assert(await button.isEnabled(), 'coach button must re-enable after success')
    assert((await page.locator('#ai-coach-recommendation').textContent()) === 'Track the next return earlier.', 'recommendation must render')
    assert((await page.locator('#ai-coach-category').textContent()) === 'consistency', 'category must render')

    await button.click()
    await page.waitForFunction(() => document.querySelector('#ai-coach-status')?.textContent === 'AI advice is temporarily unavailable. Please try again later.')
    assert(await button.isEnabled(), 'coach button must re-enable after safe failure')
    assert((await page.locator('#ai-coach-summary').textContent()) === '', 'failure must clear old advice')
    assert((await page.locator('#ai-coach-recommendation').textContent()) === '', 'failure must clear old recommendation')
    assert((await page.locator('#ai-coach-category').textContent()) === '', 'failure must clear old category')

    await page.evaluate(() => window.__brickPulseSmoke?.restart())
    assert(await coach.isHidden(), 'restart must hide coach output')
    assert((await page.locator('#ai-coach-status').textContent()) === '', 'restart must clear status')
    assert(requestCount === 2, 'only explicit clicks may request advice')

    await page.evaluate(() => window.__brickPulseSmoke?.complete('GAME_OVER'))
    await coach.waitFor({ state: 'visible', timeout: 1000 })
    assert(await button.isEnabled(), 'coach must be idle after GAME_OVER')
    assert(requestCount === 2, 'GAME_OVER transition must not request advice automatically')
    await page.evaluate(() => window.__brickPulseSmoke?.restart())
    assert(await coach.isHidden(), 'GAME_OVER restart must hide coach output')

    const before = await findBallCenter(page)
    await page.keyboard.press('Space')
    await page.waitForFunction((previous) => {
      const current = window.__brickPulseBallCenter?.()
      return current && Math.hypot(current.x - previous.x, current.y - previous.y) > 8
    }, before, { timeout: 3000 })
  }],
  ['Training Planner is explicit, accessible, safe, independent, and cleared on restart', async (page) => {
    let plannerRequests = 0
    await page.route('**/api/ai/training-plan', async (route) => {
      plannerRequests += 1
      await delay(100)
      await route.fulfill({
        status: plannerRequests === 1 ? 200 : 503,
        contentType: 'application/json',
        body: JSON.stringify(plannerRequests === 1
          ? { run: { runId: 'run_1', status: 'completed', stopReason: 'completed', stepCount: 2, providerAttemptCount: 2, toolCallCount: 1, elapsedMs: 8 }, plan: { summary: 'A safe plan.', focus: 'efficiency', recommendation: 'Use the measured pace.', evidence: [{ id: 'game.bricks_per_minute', finding: 'Measured pace is available.' }], confidence: 'medium', completed: true } }
          : { run: { runId: 'run_2', status: 'failed', stopReason: 'provider_failure', stepCount: 1, providerAttemptCount: 1, toolCallCount: 0, elapsedMs: 8 }, error: { code: 'TRAINING_PLAN_UNAVAILABLE', message: 'Training plan is temporarily unavailable. Please try again later.' } }),
      })
    })
    const planner = page.locator('#training-planner')
    const plannerButton = page.locator('#create-training-plan')
    const coachButton = page.locator('#ask-ai-coach')
    await page.evaluate(() => window.__brickPulseSmoke?.complete('WON'))
    await planner.waitFor({ state: 'visible', timeout: 1000 })
    assert(await plannerButton.isEnabled(), 'planner must be enabled for WON')
    assert(plannerRequests === 0, 'terminal transition must not request a plan automatically')
    assert(await coachButton.isEnabled(), 'Coach must remain independently available')
    await plannerButton.click()
    await page.waitForFunction(() => document.querySelector('#training-planner-status')?.textContent === 'CREATING TRAINING PLAN...')
    assert(await plannerButton.isDisabled(), 'planner must be disabled while pending')
    assert((await page.locator('#training-planner-status').getAttribute('role')) === 'status', 'planner pending status must be accessible')
    await page.waitForFunction(() => document.querySelector('#training-plan-summary')?.textContent === 'A safe plan.')
    assert(plannerRequests === 1, 'only planner click may start the planner flow')
    await plannerButton.click()
    await page.waitForFunction(() => document.querySelector('#training-planner-status')?.textContent === 'Training plan is temporarily unavailable. Please try again later.')
    assert((await page.locator('#training-plan-summary').textContent()) === '', 'failure must not retain partial plan data')
    await page.evaluate(() => window.__brickPulseSmoke?.restart())
    assert(await planner.isHidden(), 'restart must hide planner output')
    assert((await page.locator('#training-planner-status').textContent()) === '', 'restart must clear planner status')
    await page.evaluate(() => window.__brickPulseSmoke?.complete('GAME_OVER'))
    await planner.waitFor({ state: 'visible', timeout: 1000 })
    assert(await plannerButton.isEnabled(), 'planner must be enabled for GAME_OVER')
    assert(plannerRequests === 2, 'GAME_OVER transition must not request a plan automatically')
    await page.evaluate(() => window.__brickPulseSmoke?.restart())
    await page.evaluate(() => window.__brickPulseSmoke?.complete('WON'))
    await plannerButton.click()
    await page.evaluate(() => window.__brickPulseSmoke?.restart())
    await page.waitForTimeout(150)
    assert(await planner.isHidden(), 'late planner settlement must not repopulate a restarted game')
    assert((await page.locator('#training-plan-summary').textContent()) === '', 'late planner settlement must not render a plan')
  }],
  ['browser has no uncaught errors', async (_page, errors) => {
    assert(errors.length === 0, errors.join('\n'))
  }],
]

console.log(`Temporary smoke target: ${baseUrl}`)
console.log('This server is used only for automated checks and will stop when the command finishes.')
let failures = 0

try {
  await waitForServer()
  browser = await launchBrowser()
  const page = await browser.newPage()
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  await retry('browser navigation', async () => {
    const response = await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 5000 })
    assert(response?.ok(), `page request failed with status ${response?.status() ?? 'no response'}`)
    await page.locator('#game').waitFor({ state: 'visible', timeout: 3000 })
  })

  await page.evaluate(() => {
    const canvas = document.querySelector('#game')
    if (!(canvas instanceof HTMLCanvasElement)) return

    const context = canvas.getContext('2d')
    if (!context) return

    const centroid = (predicate, yStart, yEnd) => {
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
      let totalX = 0
      let count = 0
      for (let y = yStart; y < yEnd; y += 1) {
        for (let x = 0; x < canvas.width; x += 1) {
          const offset = (y * canvas.width + x) * 4
          if (!predicate(pixels.data[offset], pixels.data[offset + 1], pixels.data[offset + 2])) continue
          totalX += x
          count += 1
        }
      }
      return count === 0 ? null : totalX / count
    }

    window.__brickPulseBallCenter = () => {
      const frame = context.getImageData(0, 0, canvas.width, canvas.height)
      let totalX = 0
      let totalY = 0
      let count = 0
      for (let y = 0; y < canvas.height; y += 1) {
        for (let x = 0; x < canvas.width; x += 1) {
          const offset = (y * canvas.width + x) * 4
          if (frame.data[offset] > 240 && frame.data[offset + 1] > 225 && frame.data[offset + 2] < 170) {
            totalX += x
            totalY += y
            count += 1
          }
        }
      }
      return count === 0 ? null : { x: totalX / count, y: totalY / count }
    }

    window.__brickPulsePaddleCenter = () => centroid(
      (red, green, blue) => red > 80 && red < 130 && green > 220 && blue > 190,
      449,
      452,
    )
  })

  for (const [name, run] of checks) {
    try {
      await run(page, pageErrors)
      console.log(`PASS  ${name}`)
    } catch (error) {
      failures += 1
      console.error(`FAIL  ${name}`)
      console.error(`      ${error instanceof Error ? error.message : String(error)}`)
    }
  }
} catch (error) {
  failures = checks.length
  console.error('Smoke failed: browser or Vite startup did not become ready.')
  console.error(`      ${error instanceof Error ? error.message : String(error)}`)
  if (serverOutput.trim()) console.error(serverOutput.trim())
} finally {
  await browser?.close()
  await stopServer()
}

if (failures > 0) {
  console.error(`Smoke failed: ${failures}/${checks.length} checks failed.`)
  process.exitCode = 1
} else {
  console.log(`Smoke passed: ${checks.length}/${checks.length} checks passed.`)
}

console.log('Temporary smoke server stopped. Run `npm run dev` to open the game manually.')

async function launchBrowser() {
  const executablePath = await findSystemChrome()
  return chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
  })
}

async function findSystemChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH

  for (const path of ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser']) {
    try {
      await access(path)
      return path
    } catch {
      // Fall back to Playwright's installed Chromium.
    }
  }

  return undefined
}

async function waitForServer() {
  await retry('Vite server readiness', async () => {
    const pageResponse = await fetchWithRetry(`${baseUrl}/`, 3)
    assert(pageResponse.status === 200, `page returned HTTP ${pageResponse.status}`)
    const html = await pageResponse.text()
    assert(html.includes('<title>BrickPulse</title>'), 'BrickPulse title was not served')

    const moduleResponse = await fetchWithRetry(`${baseUrl}/src/main.ts`, 5)
    assert(moduleResponse.status === 200, `module entrypoint returned HTTP ${moduleResponse.status}`)
    const moduleBody = await moduleResponse.text()
    assert(moduleBody.includes('createGame') && moduleBody.includes('renderGame'), 'game module entrypoint was incomplete')
  }, 10)
}

async function fetchWithRetry(url, attempts) {
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetch(url, { signal: AbortSignal.timeout(5000) })
    } catch (error) {
      lastError = error
      if (attempt < attempts) await delay(150 * attempt)
    }
  }
  throw lastError ?? new Error(`Request failed: ${url}`)
}

async function retry(name, action, attempts = 4) {
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await action()
    } catch (error) {
      lastError = error
      if (attempt < attempts) {
        console.warn(`Retrying ${name} (${attempt + 1}/${attempts}).`)
        await delay(200 * attempt)
      }
    }
  }
  throw lastError ?? new Error(`${name} failed`)
}

async function stopServer() {
  if (server.exitCode !== null || server.signalCode !== null) return

  const exited = new Promise((resolve) => server.once('exit', resolve))
  server.kill('SIGTERM')
  let timeoutId
  const timeout = new Promise((resolve) => {
    timeoutId = setTimeout(resolve, 2000)
  })
  await Promise.race([exited, timeout])
  clearTimeout(timeoutId)
  if (server.exitCode === null && server.signalCode === null) server.kill('SIGKILL')
}

async function findBallCenter(page) {
  return page.evaluate(() => window.__brickPulseBallCenter?.() ?? null)
}

async function getPaddleCenter(page) {
  const center = await page.evaluate(() => window.__brickPulsePaddleCenter?.() ?? null)
  assert(center !== null, 'paddle pixels were not rendered')
  return center
}

async function hasPaddleAt(page, expectedCenter) {
  const center = await getPaddleCenter(page)
  return Math.abs(center - expectedCenter) < 4
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}
