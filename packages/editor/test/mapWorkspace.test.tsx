// @vitest-environment jsdom
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { MapEditorWorkspace } from '../src/components/MapEditorWorkspace'
import { MenuBar } from '../src/components/MenuBar'
import { createHarness, mockViewport, renderInApp } from './render'

// The canvas needs WebGL, which jsdom does not have; the toolbar is what is under test.
vi.mock('../src/components/MapCanvas', () => ({
  MapCanvas: () => <div data-testid="map-canvas" />,
}))

const TOOL_LABELS = {
  pencil: 'Pencil (paint tiles)',
  fill: 'Fill (flood fill the region)',
  eraser: 'Eraser',
  collision: 'Collision (toggle solid cells)',
  pan: 'Pan (drag to move the view)',
} as const

const pressed = (name: string): string | null =>
  screen.getByRole('button', { name }).getAttribute('aria-pressed')

describe('MapEditorWorkspace', () => {
  it('starts with the pencil, and exactly one tool is active at a time', async () => {
    const harness = createHarness()
    renderInApp(<MapEditorWorkspace />, harness)
    const { store } = harness.handle
    const states = () => Object.values(TOOL_LABELS).map((label) => pressed(label))

    expect(store.getState().editorUi.tool).toBe('pencil')
    expect(states()).toEqual(['true', 'false', 'false', 'false', 'false'])

    for (const [tool, label] of Object.entries(TOOL_LABELS)) {
      await userEvent.click(screen.getByRole('button', { name: label }))
      expect(store.getState().editorUi.tool).toBe(tool)
      expect(states().filter((state) => state === 'true')).toHaveLength(1)
      expect(pressed(label)).toBe('true')
    }

    // Clicking the active tool again must not leave the toolbar with no tool at all.
    await userEvent.click(screen.getByRole('button', { name: TOOL_LABELS.pan }))
    expect(store.getState().editorUi.tool).toBe('pan')
    expect(pressed(TOOL_LABELS.pan)).toBe('true')
  })

  it('steps through the integer zoom levels with the buttons, and disables them at either end', async () => {
    const harness = createHarness()
    renderInApp(<MapEditorWorkspace />, harness)
    const zoomIn = () => screen.getByRole<HTMLButtonElement>('button', { name: 'Zoom in' })
    const zoomOut = () => screen.getByRole<HTMLButtonElement>('button', { name: 'Zoom out' })
    const level = () => screen.getByLabelText('Zoom level').textContent

    expect(level()).toBe('300%')
    for (const next of ['400%', '600%', '800%']) {
      await userEvent.click(zoomIn())
      expect(level()).toBe(next)
    }
    expect(zoomIn().disabled).toBe(true)
    expect(zoomOut().disabled).toBe(false)

    for (const next of ['600%', '400%', '300%', '200%', '100%']) {
      await userEvent.click(zoomOut())
      expect(level()).toBe(next)
    }
    expect(zoomOut().disabled).toBe(true)
    expect(zoomIn().disabled).toBe(false)
    expect(harness.handle.store.getState().editorUi.zoomIndex).toBe(0)
  })

  it('leaves the zoom buttons out on a phone, where pinching zooms', () => {
    mockViewport(375, 812)
    renderInApp(<MapEditorWorkspace />)
    expect(screen.queryByRole('button', { name: 'Zoom in' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Zoom out' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Show grid' })).toBeTruthy()
  })

  it('starts with the grid and layer dimming on and the collision overlay off', () => {
    const harness = createHarness()
    renderInApp(<MapEditorWorkspace />, harness)
    expect(pressed('Show grid')).toBe('true')
    expect(pressed('Show collision')).toBe('false')
    expect(pressed('Dim other layers')).toBe('true')
    expect(harness.handle.store.getState().editorUi).toMatchObject({
      showGrid: true,
      showCollision: false,
      dimInactiveLayers: true,
    })
  })

  it('toggles each overlay on its own', async () => {
    const harness = createHarness()
    renderInApp(<MapEditorWorkspace />, harness)
    const ui = () => harness.handle.store.getState().editorUi

    await userEvent.click(screen.getByRole('button', { name: 'Show collision' }))
    expect(ui()).toMatchObject({ showGrid: true, showCollision: true, dimInactiveLayers: true })
    await userEvent.click(screen.getByRole('button', { name: 'Show grid' }))
    expect(ui()).toMatchObject({ showGrid: false, showCollision: true, dimInactiveLayers: true })
    await userEvent.click(screen.getByRole('button', { name: 'Dim other layers' }))
    expect(ui()).toMatchObject({ showGrid: false, showCollision: true, dimInactiveLayers: false })
  })

  it('shares its overlays with the View menu, in both directions', async () => {
    const harness = createHarness()
    renderInApp(
      <>
        <MenuBar />
        <MapEditorWorkspace />
      </>,
      harness,
    )
    const viewItem = async (label: RegExp) => {
      await userEvent.click(screen.getByRole('button', { name: 'View' }))
      return screen.findByRole('menuitem', { name: label })
    }

    // Toolbar -> menu: the menu item now offers the opposite action.
    await userEvent.click(screen.getByRole('button', { name: 'Show collision' }))
    await userEvent.click(screen.getByRole('button', { name: 'Show grid' }))
    await userEvent.click(screen.getByRole('button', { name: 'Dim other layers' }))
    expect(await viewItem(/Hide collision/)).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: /Show grid/ })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: /Dim other layers/ })).toBeTruthy()
    await userEvent.keyboard('{Escape}')

    // Menu -> toolbar: choosing the items flips the toolbar toggles back.
    await userEvent.click(await viewItem(/Hide collision/))
    expect(pressed('Show collision')).toBe('false')
    await userEvent.click(await viewItem(/Show grid/))
    expect(pressed('Show grid')).toBe('true')
    await userEvent.click(await viewItem(/Dim other layers/))
    expect(pressed('Dim other layers')).toBe('true')
    expect(harness.handle.store.getState().editorUi).toMatchObject({
      showGrid: true,
      showCollision: false,
      dimInactiveLayers: true,
    })
  })
})
