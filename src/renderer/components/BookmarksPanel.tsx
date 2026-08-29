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
import { FloatingOverlay, FloatingPanel } from './FloatingPanel'

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
    <FloatingOverlay onDismiss={onClose} position="top">
      <FloatingPanel borderRadius="xl" px={3} py={2} maxH="40vh" overflowY="auto">
        <HStack justify="space-between" mb={2}>
          <Text fontSize="sm" fontWeight="medium" color="gray.700">
            Bookmarks
          </Text>
          <HStack spacing={1}>
            <Button size="xs" variant="outline" colorScheme="gray" onClick={onAdd}>
              Save page
            </Button>
            <CloseButton size="sm" color="gray.500" onClick={onClose} />
          </HStack>
        </HStack>
        {bookmarks.length === 0 ? (
          <Text fontSize="xs" color="gray.500">
            No bookmarks yet.
          </Text>
        ) : (
          <VStack align="stretch" spacing={0.5}>
            {bookmarks.map((bookmark) => (
              <HStack
                key={bookmark.id}
                px={2}
                py={1.5}
                borderRadius="md"
                _hover={{ bg: 'blackAlpha.50' }}
                cursor="pointer"
              >
                <Box flex={1} onClick={() => onNavigate(bookmark.url)}>
                  <Text fontSize="xs" fontWeight="medium" noOfLines={1} color="gray.800">
                    {bookmark.title}
                  </Text>
                  <Text fontSize="2xs" noOfLines={1} color="gray.500">
                    {bookmark.url}
                  </Text>
                </Box>
                <IconButton
                  aria-label="Remove bookmark"
                  icon={<DeleteIcon boxSize={3} />}
                  size="xs"
                  variant="ghost"
                  color="gray.500"
                  onClick={() => onRemove(bookmark.id)}
                />
              </HStack>
            ))}
          </VStack>
        )}
      </FloatingPanel>
    </FloatingOverlay>
  )
}
