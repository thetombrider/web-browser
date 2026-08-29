import {
  Box,
  Button,
  HStack,
  IconButton,
  Text,
  CloseButton
} from '@chakra-ui/react'
import { AddIcon } from '@chakra-ui/icons'
import type { TabState } from '@shared/types'

interface TabBarProps {
  tabs: TabState[]
  activeTabId: string | null
  onSwitch: (id: string) => void
  onClose: (id: string) => void
  onNew: () => void
  onClosePanel: () => void
}

export function TabBar({ tabs, activeTabId, onSwitch, onClose, onNew, onClosePanel }: TabBarProps) {
  return (
    <Box
      px={3}
      py={2}
      borderBottom="1px solid"
      borderColor="whiteAlpha.100"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      <HStack justify="space-between" mb={2}>
        <Text fontSize="sm" fontWeight="medium" opacity={0.8}>
          Tabs
        </Text>
        <HStack>
          <IconButton
            aria-label="New tab"
            icon={<AddIcon />}
            size="xs"
            variant="ghost"
            onClick={onNew}
          />
          <CloseButton size="sm" onClick={onClosePanel} />
        </HStack>
      </HStack>
      <HStack spacing={2} overflowX="auto" pb={1}>
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId
          const label = tab.title === 'Browsy' || tab.url === 'browsy://home' ? 'Home' : tab.title
          return (
            <HStack
              key={tab.id}
              bg={isActive ? 'whiteAlpha.200' : 'whiteAlpha.100'}
              border="1px solid"
              borderColor={isActive ? 'whiteAlpha.400' : 'whiteAlpha.200'}
              borderRadius="md"
              px={3}
              py={1}
              minW="120px"
              maxW="200px"
              cursor="pointer"
              onClick={() => onSwitch(tab.id)}
              flexShrink={0}
            >
              <Text fontSize="sm" noOfLines={1} flex={1}>
                {label}
              </Text>
              <CloseButton
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  onClose(tab.id)
                }}
              />
            </HStack>
          )
        })}
      </HStack>
      <Button size="xs" variant="link" mt={2} onClick={onClosePanel}>
        Esc to hide
      </Button>
    </Box>
  )
}
