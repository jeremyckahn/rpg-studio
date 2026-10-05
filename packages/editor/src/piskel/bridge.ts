import {
  type RgbaImage,
  type Unsubscribe,
  dataUrlToPng,
  decodePng,
  serializePiskel,
} from '@rpgstudio/core'

import {
  type AdapterMessage,
  AdapterMessageSchema,
  HOST_SOURCE,
  type HostMessage,
} from './protocol.ts'

export interface SpriteFiles {
  readText: (path: string) => string | undefined
  readBytes: (path: string) => Uint8Array | undefined
  write: (path: string, data: Uint8Array | string) => void
}

/** Decodes any PNG the browser can show into raw pixels. */
export type ImageDecoder = (bytes: Uint8Array) => Promise<RgbaImage>

export interface PiskelBridgeOptions {
  /** The window of the Piskel iframe, or null while it is not loaded. */
  readonly target: () => Window | null
  /** Messages are accepted only from this origin (the editor's own). */
  readonly origin: string
  readonly files: SpriteFiles
  /** Where to listen for `message` events. Defaults to the editor's window. */
  readonly listenOn?: Pick<Window, 'addEventListener' | 'removeEventListener'>
  readonly decodeImage?: ImageDecoder
}

export interface SavedSprite {
  /** Path without extension: `<base>.png` and `<base>.piskel` were written. */
  readonly base: string
  readonly width: number
  readonly height: number
  readonly frames: number
}

export interface PiskelBridge {
  /** Resolves once Piskel has loaded the asset. Rejects if it reports an error. */
  open: (assetPath: string) => Promise<void>
  /** Asks Piskel for its current document; resolves after the files are written. */
  save: () => Promise<SavedSprite>
  onError: (listener: (message: string) => void) => Unsubscribe
  onReady: (listener: () => void) => Unsubscribe
  /** Fires for every save, including ones started from Piskel's own button. */
  onSaved: (listener: (sprite: SavedSprite) => void) => Unsubscribe
  isReady: () => boolean
  dispose: () => void
}

const baseOf = (path: string): string => path.replace(/\.(png|piskel)$/i, '')

/** The browser's own decoder, so palette PNGs and other variants work too. */
export const decodeImageInBrowser: ImageDecoder = async (bytes) => {
  const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/png' }))
  const canvas = document.createElement('canvas')
  canvas.setAttribute('width', String(bitmap.width))
  canvas.setAttribute('height', String(bitmap.height))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas is not available')
  context.drawImage(bitmap, 0, 0)
  const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height)
  return { width: bitmap.width, height: bitmap.height, data: new Uint8Array(data.buffer) }
}

/**
 * The editor's side of the postMessage conversation with the embedded Piskel
 * page. Opening an asset sends its `.piskel` document (layers and frames
 * included, or one built from the PNG); a save writes the updated `.png` and
 * `.piskel` into the project, which in turn resets the texture cache so the map
 * canvas shows the new art at once.
 */
export const createPiskelBridge = ({
  target,
  origin,
  files,
  listenOn = window,
  decodeImage = decodeImageInBrowser,
}: PiskelBridgeOptions): PiskelBridge => {
  let ready = false
  let counter = 0
  let currentBase: string | null = null
  let pending: ReadonlyMap<
    string,
    { resolve: (value: AdapterMessage) => void; reject: (error: Error) => void }
  > = new Map()
  let errorListeners: readonly ((message: string) => void)[] = []
  let readyListeners: readonly (() => void)[] = []
  let savedListeners: readonly ((sprite: SavedSprite) => void)[] = []
  let queued: HostMessage | null = null

  const send = (message: HostMessage): void => {
    const frame = target()
    if (!frame || !ready) {
      queued = message
      return
    }
    frame.postMessage(message, origin)
  }

  const request = (build: (requestId: string) => HostMessage): Promise<AdapterMessage> => {
    counter += 1
    const requestId = `req-${counter}`
    return new Promise((resolve, reject) => {
      pending = new Map(pending).set(requestId, { resolve, reject })
      send(build(requestId))
    })
  }

  const settle = (requestId: string | undefined, message: AdapterMessage): void => {
    // Messages without an id answer the oldest open request (the adapter's own button).
    const key = requestId ?? [...pending.keys()][0]
    const waiter = key === undefined ? undefined : pending.get(key)
    if (!waiter || key === undefined) return
    pending = new Map([...pending].filter(([id]) => id !== key))
    waiter.resolve(message)
  }

  const storeSaved = (message: Extract<AdapterMessage, { type: 'saved' }>): SavedSprite => {
    if (currentBase === null) throw new Error('Nothing is open in the sprite editor')
    files.write(`${currentBase}.png`, dataUrlToPng(message.png))
    files.write(`${currentBase}.piskel`, message.piskel)
    return {
      base: currentBase,
      width: message.width,
      height: message.height,
      frames: message.frames,
    }
  }

  const onMessage = (event: Event): void => {
    const message = event as MessageEvent<unknown>
    if (message.origin !== origin || message.source !== target()) return
    const parsed = AdapterMessageSchema.safeParse(message.data)
    if (!parsed.success) return
    const data = parsed.data

    switch (data.type) {
      case 'ready': {
        ready = true
        readyListeners.forEach((listener) => {
          listener()
        })
        const waiting = queued
        queued = null
        if (waiting) send(waiting)
        return
      }
      case 'opened':
        settle(data.requestId, data)
        return
      case 'saved': {
        try {
          const sprite = storeSaved(data)
          savedListeners.forEach((listener) => {
            listener(sprite)
          })
          settle(data.requestId, data)
        } catch (error) {
          errorListeners.forEach((listener) => {
            listener(error instanceof Error ? error.message : String(error))
          })
        }
        return
      }
      case 'error':
        errorListeners.forEach((listener) => {
          listener(data.message)
        })
        pending.forEach((waiter) => {
          waiter.reject(new Error(data.message))
        })
        pending = new Map()
        return
    }
  }

  listenOn.addEventListener('message', onMessage)

  const documentFor = async (assetPath: string): Promise<{ name: string; piskel: string }> => {
    const base = baseOf(assetPath)
    const name = base.slice(base.lastIndexOf('/') + 1)
    const existing = files.readText(`${base}.piskel`)
    if (existing !== undefined) return { name, piskel: existing }

    const png = files.readBytes(`${base}.png`)
    if (!png) throw new Error(`${base}.png is not in the project`)
    const image = await decodeImage(png)
    return {
      name,
      piskel: serializePiskel({
        name,
        fps: 12,
        width: image.width,
        height: image.height,
        frames: [image],
      }),
    }
  }

  return {
    isReady: () => ready,
    open: async (assetPath) => {
      const { name, piskel } = await documentFor(assetPath)
      currentBase = baseOf(assetPath)
      await request((requestId) => ({ source: HOST_SOURCE, type: 'open', requestId, name, piskel }))
    },
    save: async () => {
      const answer = await request((requestId) => ({
        source: HOST_SOURCE,
        type: 'requestSave',
        requestId,
      }))
      if (answer.type !== 'saved' || currentBase === null)
        throw new Error('Piskel did not return a document')
      return {
        base: currentBase,
        width: answer.width,
        height: answer.height,
        frames: answer.frames,
      }
    },
    onError: (listener) => {
      errorListeners = [...errorListeners, listener]
      return () => {
        errorListeners = errorListeners.filter((candidate) => candidate !== listener)
      }
    },
    onSaved: (listener) => {
      savedListeners = [...savedListeners, listener]
      return () => {
        savedListeners = savedListeners.filter((candidate) => candidate !== listener)
      }
    },
    onReady: (listener) => {
      readyListeners = [...readyListeners, listener]
      return () => {
        readyListeners = readyListeners.filter((candidate) => candidate !== listener)
      }
    },
    dispose: () => {
      listenOn.removeEventListener('message', onMessage)
      pending.forEach((waiter) => {
        waiter.reject(new Error('The sprite editor was closed'))
      })
      pending = new Map()
    },
  }
}

/** Used by tests and tooling that already have decoded pixels available. */
export const decodeImageWithCore: ImageDecoder = (bytes) => Promise.resolve(decodePng(bytes))
