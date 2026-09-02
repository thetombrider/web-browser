import { z } from 'zod'
import { isAllowedNavigationUrl } from '../../shared/utils'
import type { Settings } from '../../shared/types'

const searchEngineSchema = z.enum(['google', 'duckduckgo', 'bing'])
const homepageSchema = z.enum(['recent', 'blank'])
const restoreSessionSchema = z.enum(['always', 'never'])
const themeSchema = z.enum(['light', 'dark', 'system'])
const aiAssistantSchema = z.enum(['chatgpt', 'claude', 'gemini'])

export const settingsPatchSchema = z
  .object({
    homepage: homepageSchema,
    searchEngine: searchEngineSchema,
    restoreSession: restoreSessionSchema,
    theme: themeSchema,
    hasSeenShortcutTip: z.boolean(),
    linkPreview: z.boolean(),
    aiAssistant: aiAssistantSchema
  })
  .partial()
  .strict()

export function parseSettingsPatch(input: unknown): Partial<Settings> | null {
  const result = settingsPatchSchema.safeParse(input)
  if (!result.success) return null
  return result.data
}

export function parseBookmarkUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null
  const trimmed = url.trim()
  return isAllowedNavigationUrl(trimmed) ? trimmed : null
}

export function parseBookmarkTitle(title: unknown, fallback: string): string {
  if (typeof title !== 'string') return fallback
  const trimmed = title.trim()
  if (!trimmed) return fallback
  // Cap length to avoid abusive storage / UI payloads.
  return trimmed.slice(0, 500)
}

export function parseFiniteHeight(height: unknown, fallback: number, max: number): number {
  if (typeof height !== 'number' || !Number.isFinite(height)) return fallback
  return Math.min(max, Math.max(0, Math.round(height)))
}
