import { type Texture } from 'pixi.js'
import { useEffect, useRef } from 'react'
import { useStore } from 'react-redux'

import { type MapScene, type SceneState, createMapScene } from '../canvas/mapScene.ts'
import { type Vec2 } from '../canvas/geometry.ts'
import {
  type TouchEffect,
  type TouchState,
  initialTouchState,
  reduceTouch,
} from '../canvas/gestures.ts'
import { createPaintController } from '../canvas/tools.ts'
import { type RootState, selectCurrentMap } from '../store/index.ts'
import { editorUiSlice, ZOOM_LEVELS } from '../store/slices/editorUi.ts'
import { useAppDispatch, useServices } from './services.tsx'

const toScreen = (event: { clientX: number; clientY: number }, element: HTMLElement): Vec2 => {
  const rect = element.getBoundingClientRect()
  return { x: event.clientX - rect.left, y: event.clientY - rect.top }
}

/**
 * The map editing surface. React owns the element and the lifetime; the PixiJS
 * scene is driven imperatively from Redux state so a pointer move never causes a
 * React render. Mouse: pan with middle or right drag, Space + drag, or the Pan tool;
 * zoom with the wheel. Touch: one finger uses the tool, two fingers pan and pinch to
 * zoom (see `canvas/gestures.ts`).
 */
export const MapCanvas = () => {
  const store = useStore<RootState>()
  const dispatch = useAppDispatch()
  const { textures } = useServices()
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return undefined

    let disposed = false
    let cleanup: (() => void) | undefined

    void createMapScene(container).then((scene: MapScene) => {
      if (disposed) {
        scene.destroy()
        return
      }

      let tileset: Texture | undefined
      let tilesetPath: string | null = null
      let requested = 0

      const sceneState = (): SceneState | null => {
        const state = store.getState()
        const map = selectCurrentMap(state)
        if (!map) return null
        return {
          map,
          tileset: map.tileset === tilesetPath ? tileset : undefined,
          selectedLayer: Math.min(state.editorUi.selectedLayer, map.layers.length - 1),
          dimInactiveLayers: state.editorUi.dimInactiveLayers,
          showGrid: state.editorUi.showGrid,
          showCollision: state.editorUi.showCollision,
          zoom: ZOOM_LEVELS[state.editorUi.zoomIndex] ?? 1,
          tool: state.editorUi.tool,
          selectedTile: state.editorUi.selectedTile,
        }
      }

      const render = (): void => {
        const next = sceneState()
        if (!next) return
        scene.update(next)
        // Load the tileset on demand and redraw once it arrives.
        if (next.map.tileset !== tilesetPath) {
          tilesetPath = next.map.tileset
          refreshTileset()
        }
      }

      // Textures are invalidated whenever an asset changes; draw again with fresh pixels.
      const refreshTileset = (): void => {
        if (tilesetPath === null) return
        const wanted = tilesetPath
        const token = (requested += 1)
        tileset = undefined
        void textures.load(wanted).then(
          (texture) => {
            if (disposed || token !== requested) return
            tileset = texture
            render()
          },
          () => undefined,
        )
      }

      const paint = createPaintController(dispatch, () => {
        const state = store.getState()
        const map = selectCurrentMap(state)
        if (!map) throw new Error('No map to paint on')
        return {
          map,
          layer: Math.min(state.editorUi.selectedLayer, map.layers.length - 1),
          tool: state.editorUi.tool,
          tile: state.editorUi.selectedTile,
        }
      })

      let panning: { last: Vec2 } | null = null
      let touch: TouchState = initialTouchState
      let spaceHeld = false
      const canvas = scene.app.canvas

      const panTool = (): boolean => store.getState().editorUi.tool === 'pan'
      const applyTouchEffect = (effect: TouchEffect): void => {
        switch (effect.type) {
          case 'paintStart':
            paint.pointerDown(scene.cellAt(effect.at))
            break
          case 'paintMove':
            paint.pointerMove(scene.cellAt(effect.at))
            break
          case 'paintEnd':
            paint.pointerUp()
            break
          case 'pan':
            scene.panBy(effect.delta)
            break
          case 'zoom':
            scene.setZoomAnchor(effect.anchor)
            dispatch(editorUiSlice.actions.zoomStepped(effect.step))
            break
        }
      }
      const handleTouch = (type: 'down' | 'move' | 'up' | 'cancel', event: PointerEvent): void => {
        const next = reduceTouch(
          touch,
          { type, id: event.pointerId, pos: toScreen(event, container) },
          { panOnly: panTool() },
        )
        touch = next.state
        next.effects.forEach(applyTouchEffect)
      }

      const onPointerDown = (event: PointerEvent): void => {
        try {
          canvas.setPointerCapture(event.pointerId)
        } catch {
          // The pointer ended before we could capture it; the gesture handlers cope without capture.
        }
        if (event.pointerType === 'touch') {
          handleTouch('down', event)
          return
        }
        const screen = toScreen(event, container)
        const dragPans = event.button === 0 && (spaceHeld || panTool())
        if (event.button === 1 || event.button === 2 || dragPans) {
          panning = { last: screen }
          return
        }
        if (event.button === 0) paint.pointerDown(scene.cellAt(screen))
      }
      const onPointerMove = (event: PointerEvent): void => {
        if (event.pointerType === 'touch') {
          handleTouch('move', event)
          return
        }
        const screen = toScreen(event, container)
        if (panning) {
          scene.panBy({ x: screen.x - panning.last.x, y: screen.y - panning.last.y })
          panning = { last: screen }
          return
        }
        const cell = scene.cellAt(screen)
        scene.setHover(cell)
        paint.pointerMove(cell)
      }
      const onPointerUp = (event: PointerEvent): void => {
        if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
        if (event.pointerType === 'touch') {
          handleTouch(event.type === 'pointercancel' ? 'cancel' : 'up', event)
          return
        }
        panning = null
        paint.pointerUp()
      }
      const onPointerLeave = (): void => {
        if (!paint.active()) scene.setHover(null)
      }
      const onWheel = (event: WheelEvent): void => {
        event.preventDefault()
        scene.setZoomAnchor(toScreen(event, container))
        dispatch(editorUiSlice.actions.zoomStepped(event.deltaY < 0 ? 1 : -1))
      }
      const onKeyDown = (event: KeyboardEvent): void => {
        if (event.code === 'Space' && !(event.target instanceof HTMLInputElement)) {
          spaceHeld = true
          event.preventDefault()
        }
      }
      const onKeyUp = (event: KeyboardEvent): void => {
        if (event.code === 'Space') spaceHeld = false
      }
      const onContextMenu = (event: Event): void => {
        event.preventDefault()
      }

      canvas.addEventListener('pointerdown', onPointerDown)
      canvas.addEventListener('pointermove', onPointerMove)
      canvas.addEventListener('pointerup', onPointerUp)
      canvas.addEventListener('pointercancel', onPointerUp)
      canvas.addEventListener('pointerleave', onPointerLeave)
      canvas.addEventListener('wheel', onWheel, { passive: false })
      canvas.addEventListener('contextmenu', onContextMenu)
      window.addEventListener('keydown', onKeyDown)
      window.addEventListener('keyup', onKeyUp)

      const unsubscribe = store.subscribe(render)
      const stopResize = new ResizeObserver(() => {
        scene.centerMap()
        render()
      })
      stopResize.observe(container)
      // Asset changes reset the texture cache; reload the tileset and redraw.
      const stopAssets = (() => {
        let previous = store.getState().assets.versions
        return store.subscribe(() => {
          const next = store.getState().assets.versions
          if (next !== previous) {
            previous = next
            refreshTileset()
          }
        })
      })()
      render()

      cleanup = () => {
        unsubscribe()
        stopAssets()
        stopResize.disconnect()
        canvas.removeEventListener('pointerdown', onPointerDown)
        canvas.removeEventListener('pointermove', onPointerMove)
        canvas.removeEventListener('pointerup', onPointerUp)
        canvas.removeEventListener('pointercancel', onPointerUp)
        canvas.removeEventListener('pointerleave', onPointerLeave)
        canvas.removeEventListener('wheel', onWheel)
        canvas.removeEventListener('contextmenu', onContextMenu)
        window.removeEventListener('keydown', onKeyDown)
        window.removeEventListener('keyup', onKeyUp)
        scene.destroy()
      }
    })

    return () => {
      disposed = true
      cleanup?.()
    }
  }, [store, dispatch, textures])

  return (
    <div
      ref={containerRef}
      data-testid="map-canvas"
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        touchAction: 'none',
        cursor: 'crosshair',
        // The browser must not scroll or zoom the page under a finger; gestures are ours.
        userSelect: 'none',
        WebkitTouchCallout: 'none',
      }}
    />
  )
}
