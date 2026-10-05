import { type EventBus } from '@rpgstudio/core'

import { type GameEventMap } from '../game/types.ts'

export interface MessageBox {
  readonly element: HTMLElement
  dispose: () => void
}

const STYLE = [
  'position:absolute',
  'left:50%',
  'bottom:4%',
  'transform:translateX(-50%)',
  'width:min(90%,720px)',
  'box-sizing:border-box',
  'padding:14px 18px',
  'background:rgba(8,12,40,0.88)',
  'border:2px solid #dfe6ff',
  'border-radius:8px',
  'color:#fff',
  'font:16px/1.4 monospace',
  'white-space:pre-wrap',
  'pointer-events:none',
  'display:none',
].join(';')

/** A DOM overlay that shows the game's current message above the canvas. */
export const createMessageBox = (parent: HTMLElement, bus: EventBus<GameEventMap>): MessageBox => {
  const element = parent.ownerDocument.createElement('div')
  element.setAttribute('role', 'status')
  element.setAttribute('aria-live', 'polite')
  element.setAttribute('style', STYLE)
  parent.append(element)

  const stopMessage = bus.on('message', ({ face, text }) => {
    element.textContent = face ? `${face}: ${text}` : text
    element.style.display = 'block'
  })
  const stopClosed = bus.on('messageClosed', () => {
    element.textContent = ''
    element.style.display = 'none'
  })

  return {
    element,
    dispose: () => {
      stopMessage()
      stopClosed()
      element.remove()
    },
  }
}
