import { useState } from 'react'
import { Box, Image, Spinner } from '@chakra-ui/react'
import { faviconUrlForPage } from '../utils/favicon'
import { letterForUrl } from '../utils/suggestions'

interface FaviconProps {
  url: string
  favicon?: string | null
  isLoading?: boolean
  size?: number
}

export function Favicon({ url, favicon, isLoading = false, size = 16 }: FaviconProps) {
  const [failed, setFailed] = useState(false)
  const src = failed ? null : faviconUrlForPage(url, favicon)

  return (
    <Box
      w={`${size}px`}
      h={`${size}px`}
      borderRadius="sm"
      bg="browsy.glyph"
      display="flex"
      alignItems="center"
      justifyContent="center"
      flexShrink={0}
      overflow="hidden"
      fontSize={`${Math.max(9, size - 7)}px`}
      fontWeight="600"
      color="browsy.glyphText"
    >
      {isLoading ? (
        <Spinner size="xs" thickness="1px" speed="0.6s" />
      ) : src ? (
        <Image
          src={src}
          alt=""
          w="100%"
          h="100%"
          objectFit="contain"
          onError={() => setFailed(true)}
        />
      ) : (
        letterForUrl(url)
      )}
    </Box>
  )
}
