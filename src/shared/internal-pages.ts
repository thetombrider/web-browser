/** Internal browsy pages that keep the navigation chrome visible. */
export function showsNavigationChrome(url: string): boolean {
  return url.startsWith('browsy://home') || url.startsWith('browsy://settings') || url.startsWith('browsy://shortcuts')
}

/** Human-readable tab label for internal browsy pages. */
export function browsyPageLabel(url: string): string | null {
  if (url.startsWith('browsy://home')) return 'Home'
  if (url.startsWith('browsy://bookmarks')) return 'Bookmarks'
  if (url.startsWith('browsy://settings')) return 'Settings'
  if (url.startsWith('browsy://shortcuts')) return 'Shortcuts'
  return null
}
