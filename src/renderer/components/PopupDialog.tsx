import {
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  Button,
  Text
} from '@chakra-ui/react'
import { useRef } from 'react'
import type { PopupRequest } from '@shared/types'

interface PopupDialogProps {
  request: PopupRequest
  onAllow: () => void
  onDeny: () => void
}

export function PopupDialog({ request, onAllow, onDeny }: PopupDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  return (
    <AlertDialog
      isOpen
      leastDestructiveRef={cancelRef}
      onClose={onDeny}
      isCentered
    >
      <AlertDialogOverlay>
        <AlertDialogContent mx={4} style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <AlertDialogHeader>Open pop-up?</AlertDialogHeader>
          <AlertDialogBody>
            <Text mb={2}>This site wants to open a new window:</Text>
            <Text fontSize="sm" opacity={0.8} wordBreak="break-all">
              {request.url}
            </Text>
          </AlertDialogBody>
          <AlertDialogFooter>
            <Button ref={cancelRef} onClick={onDeny}>
              Block
            </Button>
            <Button colorScheme="blue" onClick={onAllow} ml={3}>
              Allow
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialogOverlay>
    </AlertDialog>
  )
}
