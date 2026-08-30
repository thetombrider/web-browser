import http from 'http'
import { ApiServer } from '../src/main/services/api-server'

function request(
  method: string,
  path: string,
  headers: Record<string, string> = {},
  body?: string
): Promise<{ status: number; headers: http.IncomingHttpHeaders; data: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port: 9375, path, method, headers },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, headers: res.headers, data: Buffer.concat(chunks).toString('utf8') })
        )
      }
    )
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

async function main(): Promise<void> {
  const wm = {
    getFocusedState: () => ({ tabs: [], activeTabId: null }),
    navigateFocused: async () => {},
    goBackFocused: () => {},
    goForwardFocused: () => {},
    reloadFocused: () => {},
    stopFocused: () => {},
    newTabFocused: async () => {},
    closeTabFocused: () => {},
    switchTabFocused: () => {},
    createWindow: async () => {},
    toggleDevToolsFocused: () => {}
  }

  const server = new ApiServer(wm as never, 'test-token-abc')
  server.start()
  await new Promise((r) => setTimeout(r, 400))

  const noAuth = await request('GET', '/state')
  const badAuth = await request('GET', '/state', { Authorization: 'Bearer wrong' })
  const okAuth = await request('GET', '/state', { Authorization: 'Bearer test-token-abc' })
  const options = await request('OPTIONS', '/state')
  let big: { status?: number; error?: string }
  try {
    const body = 'x'.repeat(70 * 1024)
    big = await request(
      'POST',
      '/navigate',
      {
        Authorization: 'Bearer test-token-abc',
        'Content-Type': 'application/json',
        'Content-Length': String(body.length)
      },
      body
    )
  } catch (err) {
    big = { error: err instanceof Error ? (err as NodeJS.ErrnoException).code || err.message : String(err) }
  }

  console.log(
    JSON.stringify(
      {
        noAuth: noAuth.status,
        badAuth: badAuth.status,
        okAuth: okAuth.status,
        okBody: okAuth.data,
        options: options.status,
        big: big.status ?? big.error,
        corsHeader: okAuth.headers['access-control-allow-origin'] ?? null
      },
      null,
      2
    )
  )

  server.stop()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
