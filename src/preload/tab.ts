/// <reference lib="dom" />

import { ipcRenderer } from 'electron'

const blockMediaUntilActivated = process.argv.includes('--browsy-block-media-until-activated')
let mediaPlaybackBlocked = blockMediaUntilActivated

if (blockMediaUntilActivated) {
  const nativePlay = HTMLMediaElement.prototype.play

  const pauseIfBlocked = (target: EventTarget | null): void => {
    if (mediaPlaybackBlocked && target instanceof HTMLMediaElement) {
      target.pause()
    }
  }

  HTMLMediaElement.prototype.play = function (): Promise<void> {
    if (mediaPlaybackBlocked) {
      pauseIfBlocked(this)
      return Promise.reject(new DOMException('Media playback is disabled until this tab is activated.', 'NotAllowedError'))
    }
    return nativePlay.call(this)
  }

  // Native autoplay does not necessarily call the page-visible play() method.
  // Capture these non-bubbling events before page listeners can resume media.
  document.addEventListener('play', (event) => pauseIfBlocked(event.target), true)
  document.addEventListener('playing', (event) => pauseIfBlocked(event.target), true)

  ipcRenderer.on('browsy:allow-media-playback', () => {
    mediaPlaybackBlocked = false
  })
}
