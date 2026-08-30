import { Box, Text, useColorModeValue } from '@chakra-ui/react'
import { AnimatePresence, motion } from 'framer-motion'
import type { ToastPayload } from '@shared/types'

const MotionBox = motion(Box)

interface ToastHostProps {
  toast: ToastPayload | null
}

export function ToastHost({ toast }: ToastHostProps) {
  const bg = useColorModeValue('gray.900', 'whiteAlpha.900')
  const color = useColorModeValue('white', 'gray.900')

  return (
    <Box position="fixed" top="48px" left="50%" transform="translateX(-50%)" zIndex={2000} pointerEvents="none">
      <AnimatePresence>
        {toast && (
          <MotionBox
            key={toast.id}
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            bg={bg}
            color={color}
            px={3}
            py={2}
            borderRadius="md"
            boxShadow="md"
            minW="160px"
            textAlign="center"
          >
            <Text fontSize="sm" fontWeight="500">
              {toast.message}
            </Text>
          </MotionBox>
        )}
      </AnimatePresence>
    </Box>
  )
}
