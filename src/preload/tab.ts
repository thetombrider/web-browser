import { ipcRenderer } from 'electron'

const blockMediaUntilActivated = process.argv.includes('--browsy-block-media-until-activated')
let mediaPlaybackBlocked = blockMediaUntilActivated

if (blockMediaUntilActivated) {
  const nativePlay = HTMLMediaElement.prototype.play

  HTMLMediaElement.prototype.play = function (): Promise<void> {
    if (mediaPlaybackBlocked) {
      this.pause()
      return Promise.reject(new DOMException('Media playback is disabled until this tab is activated.', 'NotAllowedError'))
    }
    return nativePlay.call(this)
  }

  ipcRenderer.on('browsy:allow-media-playback', () => {
    mediaPlaybackBlocked = false
  })
}
