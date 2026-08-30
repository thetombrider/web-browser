import { Box, Image, Text } from '@chakra-ui/react'
import { motion } from 'framer-motion'
import type { CarouselState, TabState } from '@shared/types'
import { Favicon } from './Favicon'

const MotionBox = motion(Box)

interface TabCarouselProps {
  tabs: TabState[]
  carousel: CarouselState
  thumbnails: Record<string, string>
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname || url
  } catch {
    return url
  }
}

export function TabCarousel({ tabs, carousel, thumbnails }: TabCarouselProps) {
  const selectedIndex = tabs.findIndex((tab) => tab.id === carousel.selectedTabId)
  if (selectedIndex < 0) return null

  return (
    <Box
      position="fixed"
      inset={0}
      zIndex={1600}
      bg="browsy.backdrop"
      display="flex"
      alignItems="center"
      justifyContent="center"
      overflow="hidden"
      pointerEvents="auto"
      sx={{ WebkitAppRegion: 'no-drag' }}
      aria-label="Tab switcher"
    >
      <Box position="relative" w="100%" h="300px" maxW="1400px">
        {tabs.map((tab, index) => {
          let offset = index - selectedIndex
          if (offset > tabs.length / 2) offset -= tabs.length
          if (offset < -tabs.length / 2) offset += tabs.length
          if (Math.abs(offset) > 2) return null

          const focused = offset === 0
          return (
            <MotionBox
              key={tab.id}
              position="absolute"
              top="50%"
              left="50%"
              ml={{ base: '-36vw', sm: '-150px', md: '-180px' }}
              mt={{ base: '-22.5vw', sm: '-93.75px', md: '-112.5px' }}
              w={{ base: '72vw', sm: '300px', md: '360px' }}
              aspectRatio={16 / 10}
              borderRadius="xl"
              border="2px solid"
              borderColor={focused ? 'browsy.accent' : 'browsy.border'}
              bg="browsy.card"
              boxShadow={focused ? 'browsyCardFocused' : 'browsyCard'}
              overflow="hidden"
              animate={{
                x: offset * 390,
                scale: focused ? 1 : 0.86,
                opacity: focused ? 1 : Math.abs(offset) === 1 ? 0.72 : 0.4
              }}
              zIndex={focused ? 3 : 2 - Math.abs(offset)}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              role="option"
              aria-selected={focused}
            >
              <Box h="100%" bg="browsy.preview">
                {thumbnails[tab.id] ? (
                  <Image src={thumbnails[tab.id]} alt="" w="100%" h="100%" objectFit="cover" />
                ) : (
                  <Box h="100%" bgGradient="linear(to-br, browsy.previewGradientStart, browsy.previewGradientEnd)" />
                )}
              </Box>
              <Box position="absolute" left={0} right={0} bottom={0} px={4} py={3} bg="browsy.overlay" color="browsy.overlayText">
                <Box display="flex" alignItems="center" gap={2} minW={0}>
                  <Favicon url={tab.url} favicon={tab.favicon} isLoading={tab.isLoading} size={18} />
                  <Text fontSize="sm" fontWeight="600" noOfLines={1}>{tab.title}</Text>
                </Box>
                <Text fontSize="xs" color="browsy.overlayMuted" noOfLines={1} mt={1}>{hostname(tab.url)}</Text>
              </Box>
            </MotionBox>
          )
        })}
      </Box>
      <Text position="absolute" bottom="8%" color="browsy.overlayHint" fontSize="sm" letterSpacing="wide">
        Enter to switch · Esc to cancel
      </Text>
      <Text position="absolute" top="8%" color="browsy.overlayText" fontSize="lg" fontWeight="600">
        {selectedIndex + 1} / {tabs.length}
      </Text>
    </Box>
  )
}
