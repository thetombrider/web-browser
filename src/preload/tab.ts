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

  const allowMediaPlaybackAfterUserGesture = (event: Event): void => {
    if (!event.isTrusted || !mediaPlaybackBlocked) return
    mediaPlaybackBlocked = false
    ipcRenderer.send('browsy:media-user-activation')
    document.removeEventListener('pointerdown', allowMediaPlaybackAfterUserGesture, true)
    document.removeEventListener('keydown', allowMediaPlaybackAfterUserGesture, true)
    document.removeEventListener('touchstart', allowMediaPlaybackAfterUserGesture, true)
  }

  document.addEventListener('pointerdown', allowMediaPlaybackAfterUserGesture, true)
  document.addEventListener('keydown', allowMediaPlaybackAfterUserGesture, true)
  document.addEventListener('touchstart', allowMediaPlaybackAfterUserGesture, true)
}
