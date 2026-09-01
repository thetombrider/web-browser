import { Menu, clipboard, type BrowserWindow, type ContextMenuParams, type WebContents } from 'electron'
import { AI_ASSISTANT_LABELS, resolveContextTargetUrl } from '../../shared/ai-assistant'
import type { AiAssistant } from '../../shared/types'
import { getSettings } from './store'

export interface PageContextMenuHandlers {
  openInNewTab: (url: string) => void
  openInNewWindow: (url: string) => void
  screenshotPage: () => void
  askAi: (selection: string, pageUrl: string) => void
}

export function popupPageContextMenu(
  window: BrowserWindow,
  webContents: WebContents,
  params: ContextMenuParams,
  pageUrl: string,
  viewOffset: { x: number; y: number },
  handlers: PageContextMenuHandlers
): void {
  if (window.isDestroyed() || webContents.isDestroyed()) return

  const targetUrl = resolveContextTargetUrl(params.linkURL, pageUrl)
  const selection = params.selectionText?.trim() ?? ''
  const assistant: AiAssistant = getSettings().aiAssistant ?? 'chatgpt'
  const flags = params.editFlags

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'Open in new tab',
      enabled: Boolean(targetUrl),
      click: () => {
        if (targetUrl) handlers.openInNewTab(targetUrl)
      }
    },
    {
      label: 'Open in new window',
      enabled: Boolean(targetUrl),
      click: () => {
        if (targetUrl) handlers.openInNewWindow(targetUrl)
      }
    },
    {
      label: 'Screenshot page',
      click: () => handlers.screenshotPage()
    }
  ]

  if (selection) {
    template.push(
      { type: 'separator' },
      {
        label: `Ask ${AI_ASSISTANT_LABELS[assistant]}`,
        click: () => handlers.askAi(selection, pageUrl)
      },
      {
        label: 'Copy',
        enabled: flags.canCopy,
        click: () => clipboard.writeText(params.selectionText)
      }
    )
  }

  if (params.isEditable) {
    template.push({ type: 'separator' })
    if (flags.canCut) {
      template.push({
        label: 'Cut',
        click: () => webContents.cut()
      })
    }
    if (!selection && flags.canCopy) {
      template.push({
        label: 'Copy',
        click: () => webContents.copy()
      })
    }
    if (flags.canPaste) {
      template.push({
        label: 'Paste',
        click: () => webContents.paste()
      })
    }
    if (flags.canSelectAll) {
      template.push({
        label: 'Select all',
        click: () => webContents.selectAll()
      })
    }
  } else if (!selection && flags.canSelectAll) {
    template.push(
      { type: 'separator' },
      {
        label: 'Select all',
        click: () => webContents.selectAll()
      }
    )
  }

  const menu = Menu.buildFromTemplate(template)
  menu.popup({
    window,
    x: Math.round(viewOffset.x + params.x),
    y: Math.round(viewOffset.y + params.y)
  })
}
