import { Box } from '@chakra-ui/react'

export function DragRegion() {
  return (
    <Box
      position="absolute"
      top={0}
      left={0}
      right={0}
      height="32px"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    />
  )
}
