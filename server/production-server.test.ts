import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { createProductionHttpHandler, PRODUCTION_CSP } from './production-server.js'

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

async function fixture() {
  const parent = await mkdtemp(join(tmpdir(), 'brickpulse-production-'))
  temporaryRoots.push(parent)
  const root = join(parent, 'dist')
  await mkdir(join(root, 'assets'), { recursive: true })
  await writeFile(join(root, 'index.html'), '<!doctype html><title>BrickPulse</title><script type="module" src="/assets/app.js"></script>')
  await writeFile(join(root, 'assets', 'app.js'), 'globalThis.BrickPulseLoaded = true')
  await writeFile(join(parent, 'secret.txt'), 'outside-root')
  return { parent, root }
}

async function get(handler: ReturnType<typeof createProductionHttpHandler>, path: string) {
  const server = createServer(handler)
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const { port } = server.address() as AddressInfo
  try {
    const response = await fetch(`http://127.0.0.1:${port}${path}`)
    return { status: response.status, headers: response.headers, body: await response.text() }
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
}

describe('W08-031 production frontend serving and security headers', () => {
  it('serves the built index and immutable asset with the exact production security policy', async () => {
    const { root } = await fixture()
    const handler = createProductionHttpHandler((_request, response) => response.end(), root)

    const index = await get(handler, '/')
    const asset = await get(handler, '/assets/app.js')

    expect(index.status).toBe(200)
    expect(index.body).toContain('<title>BrickPulse</title>')
    expect(index.headers.get('content-security-policy')).toBe(PRODUCTION_CSP)
    expect(index.headers.get('x-content-type-options')).toBe('nosniff')
    expect(index.headers.get('referrer-policy')).toBe('no-referrer')
    expect(index.headers.get('x-frame-options')).toBe('DENY')
    expect(index.headers.get('permissions-policy')).toBe('camera=(), microphone=(), geolocation=()')
    expect(index.headers.get('cache-control')).toBe('no-cache')
    expect(asset.status).toBe(200)
    expect(asset.headers.get('content-type')).toBe('text/javascript; charset=utf-8')
    expect(asset.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
  })

  it('rejects encoded traversal without exposing files outside the build root', async () => {
    const { root } = await fixture()
    const handler = createProductionHttpHandler((_request, response) => response.end(), root)

    const response = await get(handler, '/..%2Fsecret.txt')

    expect(response.status).toBe(404)
    expect(response.body).toBe('Not Found')
    expect(response.body).not.toContain('outside-root')
    expect(response.headers.get('content-security-policy')).toBe(PRODUCTION_CSP)
  })

  it('preserves API delegation while applying the same security headers', async () => {
    const { root } = await fixture()
    let apiCalls = 0
    const handler = createProductionHttpHandler((_request, response) => {
      apiCalls += 1
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end('{"ok":true}')
    }, root)

    const response = await get(handler, '/api/health')

    expect(response.status).toBe(200)
    expect(response.body).toBe('{"ok":true}')
    expect(response.headers.get('content-security-policy')).toBe(PRODUCTION_CSP)
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(apiCalls).toBe(1)
  })
})
