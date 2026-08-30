import { Box, Tooltip } from '@chakra-ui/react'
import type { UrlScheme } from '../utils/origin'
import { schemeLabel } from '../utils/origin'

interface OriginCueProps {
  scheme: UrlScheme
}

function LockClosed({ color }: { color: string }) {
  return (
    <Box as="svg" viewBox="0 0 16 16" w="14px" h="14px" fill={color} aria-hidden>
      <path d="M8 1a3.5 3.5 0 0 0-3.5 3.5V6H3.75A1.75 1.75 0 0 0 2 7.75v5.5C2 14.216 2.784 15 3.75 15h8.5A1.75 1.75 0 0 0 14 13.25v-5.5A1.75 1.75 0 0 0 12.25 6H11.5V4.5A3.5 3.5 0 0 0 8 1Zm2 5H6V4.5a2 2 0 1 1 4 0V6Z" />
    </Box>
  )
}

function LockOpen({ color }: { color: string }) {
  return (
    <Box as="svg" viewBox="0 0 16 16" w="14px" h="14px" fill={color} aria-hidden>
      <path d="M8 1a3.5 3.5 0 0 0-3.5 3.5V6H3.75A1.75 1.75 0 0 0 2 7.75v5.5C2 14.216 2.784 15 3.75 15h8.5A1.75 1.75 0 0 0 14 13.25v-5.5A1.75 1.75 0 0 0 12.25 6H11.5V4.5a2 2 0 0 1 3.887-.67.75.75 0 0 0 1.455-.37A3.5 3.5 0 0 0 8 1ZM6 6V4.5a2 2 0 1 1 4 0V6H6Z" />
    </Box>
  )
}

/** Unmistakable origin cue for the omnibox left slot. */
export function OriginCue({ scheme }: OriginCueProps) {
  const label = schemeLabel(scheme)

  if (scheme === 'https') {
    return (
      <Tooltip label={label} openDelay={300} hasArrow>
        <Box as="span" display="inline-flex" lineHeight={0} aria-label={label}>
          <LockClosed color="browsy.secure" />
        </Box>
      </Tooltip>
    )
  }

  if (scheme === 'http') {
    return (
      <Tooltip label={label} openDelay={300} hasArrow>
        <Box as="span" display="inline-flex" lineHeight={0} aria-label={label}>
          <LockOpen color="browsy.insecure" />
        </Box>
      </Tooltip>
    )
  }

  if (scheme === 'browsy') {
    return (
      <Tooltip label={label} openDelay={300} hasArrow>
        <Box
          as="span"
          fontSize="11px"
          fontWeight="700"
          color="browsy.internal"
          lineHeight="14px"
          aria-label={label}
        >
          B
        </Box>
      </Tooltip>
    )
  }

  return null
}
