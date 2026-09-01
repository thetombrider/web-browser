import { app, session } from 'electron'
import { mkdirSync } from 'fs'
import { join } from 'path'
import { getRecentSites } from './store'

/** HTTP disk cache budget (bytes). Chromium default is often ~80–320 MB depending on platform. */
const DISK_CACHE_BYTES = 512 * 1024 * 1024
/** Media cache budget (bytes). */
const MEDIA_CACHE_BYTES = 128 * 1024 * 1024
/** Recent origins to preconnect after startup. */
const PRECONNECT_LIMIT = 6

/** Call before `app.whenReady()` so Chromium picks up cache sizing early. */
export function appendCacheCommandLineSwitches(): void {
  app.commandLine.appendSwitch('disk-cache-size', String(DISK_CACHE_BYTES))
  app.commandLine.appendSwitch('media-cache-size', String(MEDIA_CACHE_BYTES))
  // Keep background tabs from aggressive renderer throttling so restored tabs stay warm.
  app.commandLine.appendSwitch('disable-renderer-backgrounding')
  app.commandLine.appendSwitch('enable-features', 'SpareRendererForSitePerProcess')
}

/** Persist V8 bytecode cache and warm connections to recently visited sites. */
export function configureSessionCache(): void {
  const userData = app.getPath('userData')
  const codeCachePath = join(userData, 'Code Cache')
  mkdirSync(codeCachePath, { recursive: true })
  session.defaultSession.setCodeCachePath(codeCachePath)
  warmConnectionsForRecentSites()
}

export async function clearSessionCache(): Promise<void> {
  await session.defaultSession.clearCache()
}

function warmConnectionsForRecentSites(): void {
  const ses = session.defaultSession
  const seen = new Set<string>()
  for (const entry of getRecentSites(PRECONNECT_LIMIT)) {
    try {
      const origin = new URL(entry.url).origin
      if (seen.has(origin)) continue
      seen.add(origin)
      ses.preconnect({ url: origin })
    } catch {
      // Ignore malformed history URLs.
    }
  }
}
