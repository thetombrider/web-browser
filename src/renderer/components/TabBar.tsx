import {
  Box,
  HStack,
  IconButton,
  Text,
  CloseButton,
  useColorModeValue
} from '@chakra-ui/react'
import { AddIcon } from '@chakra-ui/icons'
import type { TabState } from '@shared/types'
import { Favicon } from './Favicon'

interface TabBarProps {
  tabs: TabState[]
  activeTabId: string | null
  onSwitch: (id: string) => void
  onClose: (id: string) => void
  onNew: () => void
}

export function TabBar({ tabs, activeTabId, onSwitch, onClose, onNew }: TabBarProps) {
  const activeBg = useColorModeValue('blackAlpha.100', 'whiteAlpha.200')
  const inactiveBg = useColorModeValue('transparent', 'transparent')
  const hoverBg = useColorModeValue('blackAlpha.50', 'whiteAlpha.100')

  return (
    <HStack
      px={3}
      pt={1}
      pb={0}
      spacing={1}
      overflowX="auto"
      css={{
        '&::-webkit-scrollbar': { display: 'none' },
        scrollbarWidth: 'none'
      }}
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId
        const label = tab.title === 'Browsy' || tab.url === 'browsy://home' ? 'Home' : tab.title
        return (
          <HStack
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            bg={isActive ? activeBg : inactiveBg}
            _hover={{ bg: isActive ? activeBg : hoverBg }}
            borderRadius="md"
            px={2}
            py={1}
            minW="88px"
            maxW="160px"
            h="28px"
            cursor="pointer"
            onClick={() => onSwitch(tab.id)}
            flexShrink={0}
            spacing={1.5}
            className="browsy-tab"
            sx={{
              '& .tab-close': { opacity: isActive ? 0.7 : 0 },
              '&:hover .tab-close': { opacity: 1 }
            }}
          >
            <Favicon url={tab.url} favicon={tab.favicon} isLoading={tab.isLoading} size={16} />
            <Text fontSize="xs" noOfLines={1} flex={1} fontWeight={isActive ? '600' : '400'}>
              {label}
            </Text>
            <CloseButton
              className="tab-close"
              size="sm"
              w="16px"
              h="16px"
              minW="16px"
              fontSize="10px"
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
        h="28px"
        minW="28px"
        onClick={onNew}
        flexShrink={0}
      />
    </HStack>
  )
}
