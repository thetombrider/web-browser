import { systemPreferences } from 'electron'
import type { MediaKind, MediaPermissionDecision, SiteMediaPermissions } from '../../shared/types'
import { getSiteMediaPermissions, setSiteMediaPermissions } from './store'

export function normalizeOrigin(raw: string | undefined | null): string | null {
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.origin
  } catch {
    return null
  }
}

export function mediaKindsFromTypes(types: Array<'audio' | 'video'> | undefined): MediaKind[] {
  if (!types || types.length === 0) return ['microphone', 'camera']
  const kinds = new Set<MediaKind>()
  for (const type of types) {
    if (type === 'audio') kinds.add('microphone')
    if (type === 'video') kinds.add('camera')
  }
  return kinds.size > 0 ? [...kinds] : ['microphone', 'camera']
}

export function mediaKindFromCheckType(mediaType: 'audio' | 'video' | 'unknown' | undefined): MediaKind[] {
  if (mediaType === 'audio') return ['microphone']
  if (mediaType === 'video') return ['camera']
  return ['microphone', 'camera']
}

export function describeMediaKinds(kinds: MediaKind[]): string {
  const hasMic = kinds.includes('microphone')
  const hasCam = kinds.includes('camera')
  if (hasMic && hasCam) return 'microphone and camera'
  if (hasMic) return 'microphone'
  return 'camera'
}

export function getStoredDecisions(origin: string, kinds: MediaKind[]): {
  decisions: Partial<Record<MediaKind, MediaPermissionDecision>>
  needsPrompt: boolean
  allAllowed: boolean
  anyDenied: boolean
} {
  const stored = getSiteMediaPermissions()[origin] ?? {}
  const decisions: Partial<Record<MediaKind, MediaPermissionDecision>> = {}
  let needsPrompt = false
  let allAllowed = true
  let anyDenied = false

  for (const kind of kinds) {
    const decision = stored[kind]
    if (!decision) {
      needsPrompt = true
      allAllowed = false
      continue
    }
    decisions[kind] = decision
    if (decision === 'deny') {
      anyDenied = true
      allAllowed = false
    }
  }

  return { decisions, needsPrompt, allAllowed, anyDenied }
}

export function rememberMediaDecision(
  origin: string,
  kinds: MediaKind[],
  decision: MediaPermissionDecision
): SiteMediaPermissions {
  const current = getSiteMediaPermissions()[origin] ?? {}
  const nextForOrigin: SiteMediaPermissions = { ...current }
  for (const kind of kinds) {
    nextForOrigin[kind] = decision
  }
  return setSiteMediaPermissions(origin, nextForOrigin)
}

/** Ask the OS for device access when granting a site permission (macOS). */
export async function ensureOsMediaAccess(kinds: MediaKind[]): Promise<boolean> {
  if (process.platform !== 'darwin') return true

  for (const kind of kinds) {
    const status = systemPreferences.getMediaAccessStatus(kind)
    if (status === 'granted') continue
    if (status === 'denied' || status === 'restricted') return false
    const granted = await systemPreferences.askForMediaAccess(kind)
    if (!granted) return false
  }
  return true
}
