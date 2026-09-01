import { Box } from '@chakra-ui/react'
import type { Bookmark } from '@shared/types'
import { Favicon } from './Favicon'

interface PinnedSitesRowProps {
  sites: Bookmark[]
  /** Index within `sites`, or -1 when none of these buttons is active. */
  activeIndex: number
  onHover: (index: number) => void
  onChoose: (site: Bookmark) => void
}

/** Favicon-only shortcut buttons, shared by the launcher (and mirrored on home). */
export function PinnedSitesRow({ sites, activeIndex, onHover, onChoose }: PinnedSitesRowProps) {
  if (sites.length === 0) return null

  return (
    <Box
      display="flex"
      justifyContent="center"
      alignItems="center"
      flexWrap="wrap"
      gap={1}
      role="listbox"
      aria-label="Pinned sites"
      px={3}
      py={1.5}
    >
      {sites.map((site, index) => {
        const selected = index === activeIndex
        return (
          <Box
            key={site.id}
            role="option"
            aria-label={site.title}
            aria-selected={selected}
            title={site.title}
            w="44px"
            h="44px"
            display="flex"
            alignItems="center"
            justifyContent="center"
            borderRadius="md"
            bg={selected ? 'browsy.active' : 'transparent'}
            cursor="pointer"
            transition="background 0.12s ease"
            flexShrink={0}
            _hover={{ bg: selected ? 'browsy.active' : 'browsy.hover' }}
            onMouseEnter={() => onHover(index)}
            onMouseDown={(e) => {
              e.preventDefault()
              onChoose(site)
            }}
          >
            <Favicon url={site.url} size={22} />
          </Box>
        )
      })}
    </Box>
  )
}
