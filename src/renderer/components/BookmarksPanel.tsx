import {
  Box,
  Button,
  CloseButton,
  HStack,
  IconButton,
  Text,
  VStack
} from '@chakra-ui/react'
import { DeleteIcon } from '@chakra-ui/icons'
import type { Bookmark } from '@shared/types'

interface BookmarksPanelProps {
  bookmarks: Bookmark[]
  onRemove: (id: string) => void
  onNavigate: (url: string) => void
  onAdd: () => void
  onClose: () => void
}

export function BookmarksPanel({
  bookmarks,
  onRemove,
  onNavigate,
  onAdd,
  onClose
}: BookmarksPanelProps) {
  return (
    <Box
      bg="blackAlpha.800"
      backdropFilter="blur(12px)"
      borderBottom="1px solid"
      borderColor="whiteAlpha.200"
      px={4}
      py={3}
      pt="36px"
      maxH="50vh"
      overflowY="auto"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      <HStack justify="space-between" mb={3}>
        <Text fontWeight="medium">Bookmarks</Text>
        <HStack>
          <Button size="xs" onClick={onAdd}>
            Bookmark page
          </Button>
          <CloseButton size="sm" onClick={onClose} />
        </HStack>
      </HStack>
      {bookmarks.length === 0 ? (
        <Text fontSize="sm" opacity={0.7}>
          No bookmarks yet. Press the button above to save the current page.
        </Text>
      ) : (
        <VStack align="stretch" spacing={1}>
          {bookmarks.map((bookmark) => (
            <HStack
              key={bookmark.id}
              px={2}
              py={2}
              borderRadius="md"
              _hover={{ bg: 'whiteAlpha.100' }}
              cursor="pointer"
            >
              <Box flex={1} onClick={() => onNavigate(bookmark.url)}>
                <Text fontSize="sm" fontWeight="medium" noOfLines={1}>
                  {bookmark.title}
                </Text>
                <Text fontSize="xs" opacity={0.6} noOfLines={1}>
                  {bookmark.url}
                </Text>
              </Box>
              <IconButton
                aria-label="Remove bookmark"
                icon={<DeleteIcon />}
                size="xs"
                variant="ghost"
                onClick={() => onRemove(bookmark.id)}
              />
            </HStack>
          ))}
        </VStack>
      )}
    </Box>
  )
}
