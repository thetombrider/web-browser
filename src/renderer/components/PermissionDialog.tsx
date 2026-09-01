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
import type { MediaKind, MediaPermissionRequest } from '@shared/types'

interface PermissionDialogProps {
  request: MediaPermissionRequest
  onAllow: () => void
  onDeny: () => void
}

function labelForKinds(kinds: MediaKind[]): string {
  const hasMic = kinds.includes('microphone')
  const hasCam = kinds.includes('camera')
  if (hasMic && hasCam) return 'use your microphone and camera'
  if (hasMic) return 'use your microphone'
  return 'use your camera'
}

export function PermissionDialog({ request, onAllow, onDeny }: PermissionDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  return (
    <AlertDialog
      isOpen
      leastDestructiveRef={cancelRef}
      onClose={onDeny}
      isCentered
    >
      <AlertDialogOverlay bg="transparent" display="flex" alignItems="center" justifyContent="center">
        <AlertDialogContent mx={4} my={0} style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <AlertDialogHeader>Allow media access?</AlertDialogHeader>
          <AlertDialogBody>
            <Text mb={2}>This site wants to {labelForKinds(request.kinds)}:</Text>
            <Text fontSize="sm" opacity={0.8} wordBreak="break-all">
              {request.origin}
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
