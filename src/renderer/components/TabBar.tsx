import { HStack, IconButton, Text, CloseButton } from '@chakra-ui/react'
import { AddIcon } from '@chakra-ui/icons'
import type { TabState } from '@shared/types'
import { FloatingOverlay, FloatingPanel } from './FloatingPanel'

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
    <FloatingOverlay onDismiss={onClosePanel} position="top">
      <FloatingPanel borderRadius="xl" px={2} py={1.5}>
        <HStack spacing={1.5} overflowX="auto" maxW="full">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId
            const label = tab.title === 'Browsy' || tab.url === 'browsy://home' ? 'Home' : tab.title
            return (
              <HStack
                key={tab.id}
                style={{
                  background: isActive ? 'rgba(0,0,0,0.06)' : 'transparent',
                  border: isActive ? '1px solid rgba(0,0,0,0.12)' : '1px solid transparent'
                }}
                borderRadius="md"
                px={2}
                py={0.5}
                h="26px"
                minW="88px"
                maxW="160px"
                cursor="pointer"
                onClick={() => onSwitch(tab.id)}
                flexShrink={0}
              >
                <Text fontSize="xs" noOfLines={1} flex={1} style={{ color: '#374151' }}>
                  {label}
                </Text>
                <CloseButton
                  size="xs"
                  color="gray.500"
                  onClick={(e) => {
                    e.stopPropagation()
                    onClose(tab.id)
                  }}
                />
              </HStack>
            )
          })}
          <IconButton
            aria-label="New tab"
            icon={<AddIcon boxSize={2.5} />}
            size="xs"
            variant="ghost"
            color="gray.600"
            minW="26px"
            h="26px"
            onClick={onNew}
          />
        </HStack>
      </FloatingPanel>
    </FloatingOverlay>
  )
}
