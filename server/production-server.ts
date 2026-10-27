import { readFile, stat } from 'node:fs/promises'
import type { RequestListener, ServerResponse } from 'node:http'
import { extname, resolve, sep } from 'node:path'

export const PRODUCTION_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join('; ')

const CONTENT_TYPES: Readonly<Record<string, string>> = Object.freeze({
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
})

function applySecurityHeaders(response: ServerResponse): void {
  response.setHeader('content-security-policy', PRODUCTION_CSP)
  response.setHeader('x-content-type-options', 'nosniff')
  response.setHeader('referrer-policy', 'no-referrer')
  response.setHeader('x-frame-options', 'DENY')
  response.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=()')
}

export function createProductionHttpHandler(apiHandler: RequestListener, publicRoot: string): RequestListener {
  const root = resolve(publicRoot)
  const rootPrefix = `${root}${sep}`

  return (request, response) => {
    applySecurityHeaders(response)
    const rawPath = (request.url ?? '/').split('?', 1)[0]
    if (rawPath === '/api' || rawPath.startsWith('/api/')) {
      apiHandler(request, response)
      return
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { 'content-type': 'text/plain; charset=utf-8' })
      response.end('Method Not Allowed')
      return
    }

    void serveStatic(rawPath, root, rootPrefix, request.method === 'HEAD', response)
  }
}

async function serveStatic(rawPath: string, root: string, rootPrefix: string, headOnly: boolean, response: ServerResponse): Promise<void> {
  let pathname: string
  try {
    pathname = decodeURIComponent(rawPath)
  } catch {
    respondText(response, 400, 'Bad Request')
    return
  }
  if (pathname.includes('\0')) {
    respondText(response, 400, 'Bad Request')
    return
  }
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '')
  const target = resolve(root, relative)
  if (target !== root && !target.startsWith(rootPrefix)) {
    respondText(response, 404, 'Not Found')
    return
  }
  try {
    if (!(await stat(target)).isFile()) throw new Error('not a file')
    const body = await readFile(target)
    response.writeHead(200, {
      'content-type': CONTENT_TYPES[extname(target).toLowerCase()] ?? 'application/octet-stream',
      'content-length': String(body.byteLength),
      'cache-control': relative === 'index.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
    })
    response.end(headOnly ? undefined : body)
  } catch {
    respondText(response, 404, 'Not Found')
  }
}

function respondText(response: ServerResponse, status: number, body: string): void {
  response.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' })
  response.end(body)
}
