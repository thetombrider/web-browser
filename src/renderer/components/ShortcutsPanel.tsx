import { Box, CloseButton, HStack, Kbd, Text, VStack, useColorModeValue } from '@chakra-ui/react'
import { ChromePanel } from './ChromePanel'

interface ShortcutsPanelProps {
  onClose: () => void
}

const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ['Ctrl', 'L'], label: 'Open address bar' },
  { keys: ['Ctrl', 'T'], label: 'New tab' },
  { keys: ['Ctrl', 'W'], label: 'Close tab' },
  { keys: ['Ctrl', 'Tab'], label: 'Next tab' },
  { keys: ['Ctrl', 'Shift', 'Tab'], label: 'Previous tab' },
  { keys: ['Ctrl', 'D'], label: 'Bookmark page' },
  { keys: ['Ctrl', 'B'], label: 'Bookmarks page' },
  { keys: ['Ctrl', ','], label: 'Settings' },
  { keys: ['Ctrl', 'R'], label: 'Reload' },
  { keys: ['Ctrl', '['], label: 'Back' },
  { keys: ['Ctrl', ']'], label: 'Forward' },
  { keys: ['Ctrl', 'N'], label: 'New window' },
  { keys: ['Ctrl', '/'], label: 'This shortcut list' },
  { keys: ['Esc'], label: 'Hide chrome' }
]

export function ShortcutsPanel({ onClose }: ShortcutsPanelProps) {
  const muted = useColorModeValue('gray.500', 'gray.400')
  const rowHover = useColorModeValue('blackAlpha.50', 'whiteAlpha.100')

  return (
    <ChromePanel>
      <Box px={3} pb={3} overflowY="auto" maxH="240px">
        <HStack justify="space-between" mb={3}>
          <Text fontSize="sm" fontWeight="600">
            Shortcuts
          </Text>
          <CloseButton size="sm" onClick={onClose} />
        </HStack>
        <Text fontSize="xs" color={muted} mb={3}>
          Tip: type commands like “home” or “settings” in the address bar.
        </Text>
        <VStack align="stretch" spacing={0}>
          {SHORTCUTS.map((item) => (
            <HStack
              key={item.label}
              justify="space-between"
              py={1.5}
              px={1}
              borderRadius="md"
              _hover={{ bg: rowHover }}
            >
              <Text fontSize="sm">{item.label}</Text>
              <HStack spacing={1}>
                {item.keys.map((key) => (
                  <Kbd key={`${item.label}-${key}`} fontSize="xs">
                    {key}
                  </Kbd>
                ))}
              </HStack>
            </HStack>
          ))}
        </VStack>
      </Box>
    </ChromePanel>
  )
}
