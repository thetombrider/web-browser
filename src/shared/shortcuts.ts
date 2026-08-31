export type ShortcutPlatform = 'darwin' | 'linux' | 'win32' | 'freebsd' | 'openbsd' | 'sunos' | string

type ShortcutModifier = 'meta' | 'control' | 'either'

export interface ShortcutBinding {
  key: string
  modifier: ShortcutModifier
  label: string
  code?: string
  allowShift?: boolean
}

export interface ShortcutInput {
  key: string
  code: string
  control: boolean
  meta: boolean
  shift: boolean
  alt: boolean
}

// These are OS-level accelerators, rather than application menu shortcuts.
const SYSTEM_SHORTCUTS = new Set([
  'darwin:meta+space',
  'darwin:meta+tab',
  'darwin:meta+q',
  'darwin:meta+h',
  'darwin:meta+m',
  'darwin:meta+option+esc',
  'darwin:control+arrowleft',
  'darwin:control+arrowright'
])

// Keep this list in sync with the accelerators handled by the main process.
const APP_SHORTCUTS = new Set([
  'meta+l',
  'control+l',
  'meta+t',
  'control+t',
  'meta+w',
  'control+w',
  'meta+r',
  'control+r',
  'meta+[',
  'control+[',
  'meta+]',
  'control+]',
  'meta+b',
  'control+b',
  'meta+d',
  'control+d',
  'meta+,',
  'control+,',
  'meta+i',
  'control+i',
  'meta+n',
  'control+n',
  'meta+arrowleft',
  'meta+arrowright',
  'control+arrowleft',
  'control+arrowright'
])

function shortcutId(modifier: Exclude<ShortcutModifier, 'either'>, key: string): string {
  return `${modifier}+${key.toLowerCase()}`
}

function isSystemShortcut(platform: ShortcutPlatform, binding: ShortcutBinding): boolean {
  if (binding.modifier === 'either') {
    return (
      SYSTEM_SHORTCUTS.has(`${platform}:${shortcutId('meta', binding.key)}`) ||
      SYSTEM_SHORTCUTS.has(`${platform}:${shortcutId('control', binding.key)}`)
    )
  }
  return SYSTEM_SHORTCUTS.has(`${platform}:${shortcutId(binding.modifier, binding.key)}`)
}

function isUsedByApp(binding: ShortcutBinding): boolean {
  if (binding.modifier === 'either') {
    return APP_SHORTCUTS.has(shortcutId('meta', binding.key)) || APP_SHORTCUTS.has(shortcutId('control', binding.key))
  }
  return APP_SHORTCUTS.has(shortcutId(binding.modifier, binding.key))
}

export function getShortcutsPageShortcut(platform: ShortcutPlatform): ShortcutBinding {
  const preferred: ShortcutBinding = { key: 's', modifier: 'either', label: 'Ctrl/Cmd + S' }

  if (isSystemShortcut(platform, preferred) || isUsedByApp(preferred)) {
    return { key: '/', code: 'Slash', modifier: 'either', label: 'Ctrl/Cmd + /', allowShift: true }
  }
  return preferred
}

export function matchesShortcut(input: ShortcutInput, binding: ShortcutBinding): boolean {
  const keyMatches = input.key.toLowerCase() === binding.key.toLowerCase() || input.code === binding.code
  if ((!binding.allowShift && input.shift) || input.alt || !keyMatches) return false
  if (binding.modifier === 'meta') return input.meta && !input.control
  if (binding.modifier === 'control') return input.control && !input.meta
  return input.meta !== input.control
}
