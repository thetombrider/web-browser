/** Internal browsy pages that keep the navigation chrome visible. */
export function showsNavigationChrome(url: string): boolean {
  return url.startsWith('browsy://home') || url.startsWith('browsy://settings')
}

/** Human-readable tab label for internal browsy pages. */
export function browsyPageLabel(url: string): string | null {
  if (url.startsWith('browsy://home')) return 'Home'
  if (url.startsWith('browsy://settings')) return 'Settings'
  return null
}
