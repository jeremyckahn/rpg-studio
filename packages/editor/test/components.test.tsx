// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { AssetBrowser } from '../src/components/AssetBrowser'
import { MasterLayout } from '../src/components/MasterLayout'
import { MapToolPanel } from '../src/components/MapToolPanel'
import { MenuBar } from '../src/components/MenuBar'
import { PropertiesPanel } from '../src/components/PropertiesPanel'
import { type PanelDefinition } from '../src/plugins/panelRegistry'
import { projectActions, undo } from '../src/store'
import { createHarness, mockViewport, renderInApp } from './render'

const stub = (label: string) => () => <div>{label}</div>

const panels: readonly PanelDefinition[] = [
  { id: 'map', title: 'Map', location: 'workspace', order: 1, component: stub('map workspace') },
  {
    id: 'db',
    title: 'Database',
    location: 'workspace',
    order: 2,
    component: stub('database workspace'),
  },
  { id: 'tools', title: 'Tools', location: 'left', when: 'map', component: stub('map tools') },
  {
    id: 'props',
    title: 'Props',
    location: 'right',
    when: 'map',
    component: stub('map properties'),
  },
  { id: 'always', title: 'Always', location: 'right', component: stub('always visible') },
]

const harnessWithMapActive = () => {
  const harness = createHarness(panels)
  harness.handle.store.dispatch({ type: 'editorUi/workspacePanelSelected', payload: 'map' })
  return harness
}

describe('MasterLayout', () => {
  it('shows the active workspace panel and the docked panels that belong to it', () => {
    renderInApp(<MasterLayout />, harnessWithMapActive())
    expect(screen.getByText('map workspace')).toBeTruthy()
    expect(screen.getByText('map tools')).toBeTruthy()
    expect(screen.getByText('map properties')).toBeTruthy()
    expect(screen.getByText('always visible')).toBeTruthy()
    expect(screen.queryByText('database workspace')).toBeNull()
  })

  it('switches workspace panels from the tabs, hiding docked panels tied to the old one', async () => {
    renderInApp(<MasterLayout />, harnessWithMapActive())
    await userEvent.click(screen.getByRole('tab', { name: 'Database' }))
    expect(screen.getByText('database workspace')).toBeTruthy()
    expect(screen.queryByText('map workspace')).toBeNull()
    expect(screen.queryByText('map tools')).toBeNull()
    expect(screen.queryByText('map properties')).toBeNull()
    expect(screen.getByText('always visible')).toBeTruthy()
  })

  it('renders panels registered after it mounted, supporting plugins that load late', async () => {
    const harness = harnessWithMapActive()
    renderInApp(<MasterLayout />, harness)
    harness.registry.register({
      id: 'late',
      title: 'Late Tab',
      location: 'workspace',
      order: 3,
      component: stub('late'),
    })
    expect(await screen.findByRole('tab', { name: 'Late Tab' })).toBeTruthy()
  })

  it('undoes and redoes with the keyboard, but not while typing in a field', () => {
    const harness = harnessWithMapActive()
    renderInApp(<MasterLayout />, harness)
    const { store } = harness.handle
    const name = () => store.getState().project.data.maps[0]?.name
    store.dispatch(projectActions.renameMap({ mapId: 1, name: 'Renamed' }))
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
    expect(name()).toBe('Town')
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true })
    expect(name()).toBe('Renamed')
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
    fireEvent.keyDown(window, { key: 'y', ctrlKey: true })
    expect(name()).toBe('Renamed')

    const input = document.createElement('input')
    document.body.append(input)
    fireEvent.keyDown(input, { key: 'z', ctrlKey: true })
    expect(name()).toBe('Renamed') // Ctrl+Z belongs to the text field here
    input.remove()
  })

  it('saves with Ctrl+S', () => {
    const harness = harnessWithMapActive()
    const save = vi.spyOn(harness.session, 'save').mockResolvedValue(true)
    renderInApp(<MasterLayout />, harness)
    fireEvent.keyDown(window, { key: 's', ctrlKey: true })
    expect(save).toHaveBeenCalledOnce()
  })
})

describe('MasterLayout on a small screen', () => {
  const phonePortrait = (): ReturnType<typeof harnessWithMapActive> => {
    mockViewport(375, 812)
    return harnessWithMapActive()
  }

  it('shows the workspace and the first tool, with a navigation bar instead of side docks', () => {
    renderInApp(<MasterLayout />, phonePortrait())
    expect(screen.getByText('map workspace')).toBeTruthy()
    expect(screen.getByText('map tools')).toBeTruthy()
    // Properties and assets are one tap away, not on screen.
    expect(screen.queryByText('map properties')).toBeNull()
    expect(screen.queryByLabelText('Asset browser')).toBeNull()
    expect(screen.getByRole('button', { name: /Tools/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Props/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Assets/ })).toBeTruthy()
  })

  it('switches the sheet from the navigation bar', async () => {
    renderInApp(<MasterLayout />, phonePortrait())
    await userEvent.click(screen.getByRole('button', { name: /Props/ }))
    expect(screen.getByText('map properties')).toBeTruthy()
    expect(screen.queryByText('map tools')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: /Assets/ }))
    expect(screen.getByLabelText('Assets sheet')).toBeTruthy()
  })

  it('collapses the sheet when the open section is tapped again, and reopens it', async () => {
    renderInApp(<MasterLayout />, phonePortrait())
    await userEvent.click(screen.getByRole('button', { name: /Tools/ }))
    expect(screen.queryByText('map tools')).toBeNull()
    expect(screen.getByText('map workspace')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: /Tools/ }))
    expect(screen.getByText('map tools')).toBeTruthy()
  })

  it('still switches workspace panels, and drops the sections that belonged to the old one', async () => {
    renderInApp(<MasterLayout />, phonePortrait())
    await userEvent.click(screen.getByRole('tab', { name: 'Database' }))
    expect(screen.getByText('database workspace')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Tools/ })).toBeNull()
    expect(screen.getByRole('button', { name: /Always/ })).toBeTruthy()
  })

  it('puts the sheet beside the workspace in landscape and below it in portrait', () => {
    mockViewport(812, 375)
    const landscape = renderInApp(<MasterLayout />, harnessWithMapActive())
    const sheet = screen.getByLabelText('Tools sheet')
    expect(getComputedStyle(sheet).width).not.toBe('')
    landscape.unmount()
    mockViewport(375, 812)
    renderInApp(<MasterLayout />, harnessWithMapActive())
    expect(getComputedStyle(screen.getByLabelText('Tools sheet')).height).not.toBe('')
  })

  it('shows the unsaved marker on the File button, since the project name does not fit', async () => {
    const harness = phonePortrait()
    renderInApp(<MasterLayout />, harness)
    expect(screen.getByRole('button', { name: 'File' })).toBeTruthy()
    harness.handle.store.dispatch(projectActions.renameMap({ mapId: 1, name: 'Edited' }))
    expect(await screen.findByRole('button', { name: 'File •' })).toBeTruthy()
    expect(screen.queryByLabelText('Project name')).toBeNull()
  })

  it('keeps the desktop docks on a wide screen', () => {
    mockViewport(1280, 800)
    renderInApp(<MasterLayout />, harnessWithMapActive())
    expect(screen.getByText('map tools')).toBeTruthy()
    expect(screen.getByText('map properties')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Tools/ })).toBeNull()
  })
})

describe('unsaved changes', () => {
  const dirtyHarness = () => {
    const harness = createHarness()
    harness.handle.store.dispatch(projectActions.renameMap({ mapId: 1, name: 'Edited' }))
    return harness
  }
  const withFolderSupport = (): void => {
    Reflect.defineProperty(window, 'showDirectoryPicker', {
      configurable: true,
      value: () => Promise.reject(new Error('not used')),
    })
  }
  const openFileMenu = async (item: RegExp) => {
    await userEvent.click(screen.getByRole('button', { name: /^File/ }))
    await userEvent.click(await screen.findByRole('menuitem', { name: item }))
  }

  it('warns the browser before the tab closes while there is unsaved work, and not otherwise', () => {
    const harness = harnessWithMapActive()
    renderInApp(<MasterLayout />, harness)
    const leave = () => {
      const event = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(event)
      return event.defaultPrevented
    }
    expect(leave()).toBe(false)
    harness.handle.store.dispatch(projectActions.renameMap({ mapId: 1, name: 'Edited' }))
    return waitFor(() => {
      expect(leave()).toBe(true)
    })
  })

  it('stops warning once the changes are saved', async () => {
    const harness = harnessWithMapActive()
    renderInApp(<MasterLayout />, harness)
    harness.handle.store.dispatch(projectActions.renameMap({ mapId: 1, name: 'Edited' }))
    harness.handle.store.dispatch({
      type: 'editorUi/projectSaved',
      payload: { revision: harness.handle.store.getState().project.revision },
    })
    await waitFor(() => {
      const event = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(false)
    })
  })

  it('starts a new project straight away when nothing is unsaved', async () => {
    const harness = createHarness()
    const newProject = vi.spyOn(harness.session, 'newProject')
    renderInApp(<MenuBar />, harness)
    await openFileMenu(/New project/)
    expect(newProject).toHaveBeenCalledOnce()
    expect(screen.queryByText('Discard unsaved changes?')).toBeNull()
  })

  it('asks before a new project replaces unsaved work, and Cancel keeps everything', async () => {
    const harness = dirtyHarness()
    const newProject = vi.spyOn(harness.session, 'newProject')
    renderInApp(<MenuBar />, harness)
    await openFileMenu(/New project/)
    expect(await screen.findByText('Discard unsaved changes?')).toBeTruthy()
    expect(screen.getByText(/Creating a new project replaces the open project/)).toBeTruthy()
    expect(newProject).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(newProject).not.toHaveBeenCalled()
    expect(harness.handle.store.getState().project.data.maps[0]?.name).toBe('Edited')
    await waitFor(() => {
      expect(screen.queryByText('Discard unsaved changes?')).toBeNull()
    })

    // Escape is the same answer as Cancel.
    await openFileMenu(/New project/)
    expect(await screen.findByText('Discard unsaved changes?')).toBeTruthy()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => {
      expect(screen.queryByText('Discard unsaved changes?')).toBeNull()
    })
    expect(newProject).not.toHaveBeenCalled()
    expect(harness.handle.store.getState().project.data.maps[0]?.name).toBe('Edited')
  })

  it('discards the changes when told to', async () => {
    const harness = dirtyHarness()
    const newProject = vi.spyOn(harness.session, 'newProject')
    renderInApp(<MenuBar />, harness)
    await openFileMenu(/New project/)
    await userEvent.click(await screen.findByRole('button', { name: 'Discard changes' }))
    expect(newProject).toHaveBeenCalledOnce()
  })

  it('treats an unsaved upload or sprite save as unsaved work too', async () => {
    const harness = createHarness()
    harness.assets.write('img/pictures/x.png', Uint8Array.of(1))
    renderInApp(<MenuBar />, harness)
    await openFileMenu(/New project/)
    expect(await screen.findByText('Discard unsaved changes?')).toBeTruthy()
  })

  it('offers to save first where folders are supported, and carries on after a successful save', async () => {
    withFolderSupport()
    const harness = dirtyHarness()
    const newProject = vi.spyOn(harness.session, 'newProject')
    const save = vi.spyOn(harness.session, 'save').mockResolvedValue(true)
    renderInApp(<MenuBar />, harness)
    await openFileMenu(/New project/)
    await userEvent.click(await screen.findByRole('button', { name: 'Save, then continue' }))
    expect(save).toHaveBeenCalledOnce()
    await waitFor(() => {
      expect(newProject).toHaveBeenCalledOnce()
    })
  })

  it('does not carry on when the save is cancelled', async () => {
    withFolderSupport()
    const harness = dirtyHarness()
    const newProject = vi.spyOn(harness.session, 'newProject')
    const save = vi.spyOn(harness.session, 'save').mockResolvedValue(false)
    renderInApp(<MenuBar />, harness)
    await openFileMenu(/New project/)
    await userEvent.click(await screen.findByRole('button', { name: 'Save, then continue' }))
    await waitFor(() => {
      expect(save).toHaveBeenCalledOnce()
    })
    expect(newProject).not.toHaveBeenCalled()
  })

  it('has no save-first option where folders are not supported, and points to the zip instead', async () => {
    const harness = dirtyHarness()
    renderInApp(<MenuBar />, harness)
    await openFileMenu(/New project/)
    expect(await screen.findByText(/Download project \(\.zip\)/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Save, then continue' })).toBeNull()
  })

  it('asks before opening a folder over unsaved work, and before the picker opens', async () => {
    withFolderSupport()
    const harness = dirtyHarness()
    const openFolder = vi.spyOn(harness.session, 'openFolder').mockResolvedValue(true)
    renderInApp(<MenuBar />, harness)
    await openFileMenu(/Open folder/)
    expect(await screen.findByText(/Opening a folder replaces the open project/)).toBeTruthy()
    expect(openFolder).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(openFolder).toHaveBeenCalledOnce()
  })

  it('asks before importing a zip over unsaved work, and opens the file picker only after', async () => {
    const harness = dirtyHarness()
    const pick = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined)
    renderInApp(<MenuBar />, harness)
    await openFileMenu(/Import project/)
    expect(await screen.findByText(/Importing a project replaces the open project/)).toBeTruthy()
    expect(pick).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(pick).toHaveBeenCalledOnce()
    pick.mockRestore()
  })
})

describe('update notice', () => {
  it('stays hidden until a new version is ready', () => {
    renderInApp(<MasterLayout />, harnessWithMapActive())
    expect(screen.queryByText(/new version/i)).toBeNull()
  })

  it('offers to reload and applies the update when accepted', async () => {
    const harness = harnessWithMapActive()
    renderInApp(<MasterLayout />, harness)
    harness.handle.store.dispatch({ type: 'editorUi/updateReady' })
    expect(await screen.findByText('A new version of RPG Studio is ready.')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }))
    expect(harness.updater.apply).toHaveBeenCalledOnce()
  })

  it('can be dismissed with Later, without reloading', async () => {
    const harness = harnessWithMapActive()
    renderInApp(<MasterLayout />, harness)
    harness.handle.store.dispatch({ type: 'editorUi/updateReady' })
    await userEvent.click(await screen.findByRole('button', { name: 'Later' }))
    await waitFor(() => {
      expect(screen.queryByText(/new version/i)).toBeNull()
    })
    expect(harness.updater.apply).not.toHaveBeenCalled()
  })

  it('warns about unsaved changes, because reloading discards them', async () => {
    const harness = harnessWithMapActive()
    renderInApp(<MasterLayout />, harness)
    harness.handle.store.dispatch(projectActions.renameMap({ mapId: 1, name: 'Edited' }))
    harness.handle.store.dispatch({ type: 'editorUi/updateReady' })
    expect(await screen.findByText(/unsaved changes/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reload anyway' })).toBeTruthy()
  })
})

describe('MenuBar', () => {
  it('shows the project name, an unsaved marker, and enables undo only when there is something to undo', () => {
    const harness = createHarness()
    renderInApp(<MenuBar />, harness)
    const undoButton = screen.getByRole('button', { name: 'Undo' })
    expect((undoButton as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByLabelText('Project name').textContent).toBe('Sample')

    harness.handle.store.dispatch(projectActions.renameMap({ mapId: 1, name: 'x' }))
    return waitFor(() => {
      expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Undo' }).disabled).toBe(false)
      expect(screen.getByLabelText('Project name').textContent).toBe('Sample •')
    })
  })

  it('undoes and redoes from the toolbar', async () => {
    const harness = createHarness()
    renderInApp(<MenuBar />, harness)
    harness.handle.store.dispatch(projectActions.renameMap({ mapId: 1, name: 'x' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    expect(harness.handle.store.getState().project.data.maps[0]?.name).toBe('Town')
    await userEvent.click(screen.getByRole('button', { name: 'Redo' }))
    expect(harness.handle.store.getState().project.data.maps[0]?.name).toBe('x')
  })

  it('links to the user guide (docs/user-guide) in a new tab, without leaking the opener', () => {
    renderInApp(<MenuBar />, createHarness())
    const link = screen.getByRole('link', { name: 'User guide' })
    expect(link.getAttribute('href')).toBe(
      'https://github.com/jeremyckahn/rpg-studio/tree/main/docs/user-guide',
    )
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('links the companion dialog to its setup guide', async () => {
    renderInApp(<MenuBar />, createHarness())
    await userEvent.click(screen.getByRole('button', { name: /Companion/ }))
    const link = await screen.findByRole('link', { name: 'Setup guide' })
    expect(link.getAttribute('href')).toBe(
      'https://github.com/jeremyckahn/rpg-studio/blob/main/docs/user-guide/ai-companion.md',
    )
    expect(link.getAttribute('target')).toBe('_blank')
  })

  it('starts a new project from File > New project', async () => {
    const harness = createHarness()
    const newProject = vi.spyOn(harness.session, 'newProject')
    renderInApp(<MenuBar />, harness)
    await userEvent.click(screen.getByRole('button', { name: 'File' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: /New project/ }))
    expect(newProject).toHaveBeenCalledOnce()
  })

  it('offers export and download from the File menu', async () => {
    const harness = createHarness()
    const exportGame = vi.spyOn(harness.session, 'exportGame').mockResolvedValue(true)
    const archive = vi.spyOn(harness.session, 'downloadProjectArchive').mockResolvedValue(true)
    renderInApp(<MenuBar />, harness)
    await userEvent.click(screen.getByRole('button', { name: 'File' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: /Export game/ }))
    expect(exportGame).toHaveBeenCalledOnce()
    await userEvent.click(screen.getByRole('button', { name: 'File' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: /Download project/ }))
    expect(archive).toHaveBeenCalledOnce()
  })

  it('toggles view options from the View menu', async () => {
    const harness = createHeadlessView()
    renderInApp(<MenuBar />, harness)
    expect(harness.handle.store.getState().editorUi.showCollision).toBe(false)
    await userEvent.click(screen.getByRole('button', { name: 'View' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: /Show collision/ }))
    expect(harness.handle.store.getState().editorUi.showCollision).toBe(true)
  })

  it('zooms in and out from the View menu, one level at a time', async () => {
    const harness = createHarness()
    renderInApp(<MenuBar />, harness)
    const zoomIndex = () => harness.handle.store.getState().editorUi.zoomIndex
    const start = zoomIndex()
    await userEvent.click(screen.getByRole('button', { name: 'View' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Zoom in' }))
    expect(zoomIndex()).toBe(start + 1)
    await waitFor(() => {
      expect(screen.queryByRole('menuitem', { name: 'Zoom in' })).toBeNull()
    })
    await userEvent.click(screen.getByRole('button', { name: 'View' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Zoom out' }))
    expect(zoomIndex()).toBe(start)
    await waitFor(() => {
      expect(screen.queryByRole('menuitem', { name: 'Zoom out' })).toBeNull()
    })
    await userEvent.click(screen.getByRole('button', { name: 'View' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Zoom out' }))
    expect(zoomIndex()).toBe(start - 1)
  })
})

const createHeadlessView = () => createHarness()

describe('AssetBrowser', () => {
  it('lists assets grouped by folder', () => {
    const harness = createHarness()
    harness.assets.write('img/characters/hero.png', 'x')
    harness.assets.write('img/characters/hero.piskel', 'x')
    harness.assets.write('audio/se/coin.ogg', 'x')
    renderInApp(<AssetBrowser />, harness)
    expect(screen.getByText('img/characters')).toBeTruthy()
    expect(screen.getByText('audio/se')).toBeTruthy()
    expect(screen.getByText('hero.png')).toBeTruthy()
    expect(screen.getByText('coin.ogg')).toBeTruthy()
  })

  it('opens an image in the sprite editor on double-click, but not an audio file', async () => {
    const harness = createHarness()
    harness.assets.write('img/characters/hero.png', 'x')
    harness.assets.write('audio/se/coin.ogg', 'x')
    renderInApp(<AssetBrowser />, harness)
    await userEvent.dblClick(screen.getByText('coin.ogg'))
    expect(harness.handle.store.getState().editorUi.openAssetPath).toBeNull()
    await userEvent.dblClick(screen.getByText('hero.png'))
    expect(harness.handle.store.getState().editorUi).toMatchObject({
      openAssetPath: 'img/characters/hero.png',
      workspacePanel: 'rpgstudio.pixel-editor',
    })
  })

  it('uploads files into the folder chosen from the Add menu, with a safe name', async () => {
    const harness = createHarness()
    renderInApp(<AssetBrowser />, harness)
    await userEvent.click(screen.getByRole('button', { name: /Add/ }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Sound effect (SE)' }))
    const input = screen.getByLabelText('Upload assets')
    const file = new File([Uint8Array.of(1, 2, 3)], '../../my coin!.ogg', { type: 'audio/ogg' })
    await userEvent.upload(input, file)
    await waitFor(() => {
      expect(harness.assets.list()).toEqual(['audio/se/my_coin_.ogg'])
    })
  })

  it('says so when there are no assets', () => {
    renderInApp(<AssetBrowser />)
    expect(screen.getByText('No assets yet.')).toBeTruthy()
  })
})

describe('MapToolPanel', () => {
  it('lists the maps, selects one, and protects the start map from deletion', async () => {
    const harness = createHarness()
    renderInApp(<MapToolPanel />, harness)
    expect(screen.getByText('1. Town')).toBeTruthy()
    expect(screen.getByText(/6×4 · start/)).toBeTruthy()
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Delete Town' }).disabled).toBe(
      true,
    )
    await userEvent.click(screen.getByText('2. Cave'))
    expect(harness.handle.store.getState().editorUi.selectedMapId).toBe(2)
  })

  it('refuses to delete a map that something still transfers to', async () => {
    const harness = createHarness()
    renderInApp(<MapToolPanel />, harness)
    await userEvent.click(screen.getByRole('button', { name: 'Delete Cave' }))
    expect(harness.handle.store.getState().project.data.maps).toHaveLength(2) // the Town door leads there
  })

  it('creates a map from the New map dialog', async () => {
    const harness = createHarness()
    renderInApp(<MapToolPanel />, harness)
    await userEvent.click(screen.getByRole('button', { name: 'New map' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Forest')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create' }))
    const maps = harness.handle.store.getState().project.data.maps
    expect(maps.map((m) => m.name)).toEqual(['Town', 'Cave', 'Forest'])
    expect(maps[2]).toMatchObject({ width: 20, height: 15, tileSize: 16 })
  })

  it('creates a map with the dialog defaults, naming it after its place in the list', async () => {
    const harness = createHarness()
    renderInApp(<MapToolPanel />, harness)
    await userEvent.click(screen.getByRole('button', { name: 'New map' }))
    const dialog = await screen.findByRole('dialog', { name: 'New map' })
    const nameField = within(dialog).getByLabelText<HTMLInputElement>('Name')
    expect(nameField.value).toBe('')
    expect(nameField.getAttribute('placeholder')).toBe('Map 3')
    expect(within(dialog).getByLabelText<HTMLInputElement>('Width (tiles)').value).toBe('20')
    expect(within(dialog).getByLabelText<HTMLInputElement>('Height (tiles)').value).toBe('15')
    expect(within(dialog).getByRole('combobox', { name: 'Tile size' }).textContent).toBe('16 × 16')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create' }))

    const maps = harness.handle.store.getState().project.data.maps
    const created = maps[2]
    expect(created).toMatchObject({ id: 3, name: 'Map 3', width: 20, height: 15, tileSize: 16 })
    expect(created?.layers.map((layer) => layer.name)).toEqual(['Ground', 'Objects', 'Overlay'])
    expect(created?.layers[0]?.data.every((tile) => tile === 1)).toBe(true)
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
    expect(screen.getByText('3. Map 3')).toBeTruthy()
    // Not the start map, so it can be deleted.
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Delete Map 3' }).disabled).toBe(
      false,
    )
  })

  it('creates a map with a custom name, size and tile size', async () => {
    const harness = createHarness()
    renderInApp(<MapToolPanel />, harness)
    await userEvent.click(screen.getByRole('button', { name: 'New map' }))
    const dialog = await screen.findByRole('dialog', { name: 'New map' })
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Dungeon')
    await userEvent.clear(within(dialog).getByLabelText('Width (tiles)'))
    await userEvent.type(within(dialog).getByLabelText('Width (tiles)'), '30')
    await userEvent.clear(within(dialog).getByLabelText('Height (tiles)'))
    await userEvent.type(within(dialog).getByLabelText('Height (tiles)'), '10')
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Tile size' }))
    await userEvent.click(await screen.findByRole('option', { name: '32 × 32' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create' }))

    expect(harness.handle.store.getState().project.data.maps[2]).toMatchObject({
      id: 3,
      name: 'Dungeon',
      width: 30,
      height: 10,
      tileSize: 32,
    })
    expect(await screen.findByText('3. Dungeon')).toBeTruthy()
    expect(screen.getByText('30×10')).toBeTruthy()
  })

  it('offers every supported tile size in the New map dialog', async () => {
    renderInApp(<MapToolPanel />)
    await userEvent.click(screen.getByRole('button', { name: 'New map' }))
    const dialog = await screen.findByRole('dialog', { name: 'New map' })
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Tile size' }))
    const options = await screen.findAllByRole('option')
    expect(options.map((option) => option.textContent)).toEqual([
      '16 × 16',
      '24 × 24',
      '32 × 32',
      '48 × 48',
    ])
  })

  it('limits a new map to 1 through 512 tiles in each direction', async () => {
    const harness = createHarness()
    renderInApp(<MapToolPanel />, harness)
    await userEvent.click(screen.getByRole('button', { name: 'New map' }))
    const dialog = await screen.findByRole('dialog', { name: 'New map' })
    await userEvent.clear(within(dialog).getByLabelText('Width (tiles)'))
    await userEvent.type(within(dialog).getByLabelText('Width (tiles)'), '9999')
    await userEvent.clear(within(dialog).getByLabelText('Height (tiles)'))
    await userEvent.type(within(dialog).getByLabelText('Height (tiles)'), '0')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create' }))
    expect(harness.handle.store.getState().project.data.maps[2]).toMatchObject({
      width: 512,
      height: 1,
    })
  })

  it('creates nothing when the New map dialog is cancelled', async () => {
    const harness = createHarness()
    renderInApp(<MapToolPanel />, harness)
    await userEvent.click(screen.getByRole('button', { name: 'New map' }))
    const dialog = await screen.findByRole('dialog', { name: 'New map' })
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Abandoned')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
    expect(harness.handle.store.getState().project.data.maps).toHaveLength(2)
    expect(harness.handle.store.getState().history.past).toHaveLength(0)
  })

  it('deletes a map that nothing refers to, and Undo brings it back', async () => {
    const harness = createHarness()
    const { store } = harness.handle
    store.dispatch(projectActions.createMap({ name: 'Cellar', width: 8, height: 6, tileSize: 16 }))
    renderInApp(<MapToolPanel />, harness)
    expect(screen.getByText('3. Cellar')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Delete Cellar' }))
    expect(screen.queryByText('3. Cellar')).toBeNull()
    expect(store.getState().project.data.maps.map((map) => map.name)).toEqual(['Town', 'Cave'])
    store.dispatch(undo())
    expect(await screen.findByText('3. Cellar')).toBeTruthy()
    expect(store.getState().project.data.maps.map((map) => map.name)).toEqual([
      'Town',
      'Cave',
      'Cellar',
    ])
  })

  it('lists the layers topmost first, with the Overlay drawn above characters', () => {
    renderInApp(<MapToolPanel />)
    expect(screen.getAllByText(/^(Ground|Objects|Overlay)$/).map((el) => el.textContent)).toEqual([
      'Overlay',
      'Objects',
      'Ground',
    ])
    expect(screen.getAllByText('drawn above characters')).toHaveLength(1)
  })

  it('toggles layer visibility and the above-characters flag, and selects layers', async () => {
    const harness = createHarness()
    renderInApp(<MapToolPanel />, harness)
    const layers = () => harness.handle.store.getState().project.data.maps[0]?.layers
    await userEvent.click(screen.getByRole('button', { name: 'Hide Objects' }))
    expect(layers()?.[1]?.visible).toBe(false)
    await userEvent.click(screen.getByRole('button', { name: 'Show Objects' }))
    expect(layers()?.[1]?.visible).toBe(true)
    await userEvent.click(screen.getByRole('button', { name: 'Toggle Objects above characters' }))
    expect(layers()?.[1]?.above).toBe(true)
    // The Overlay layer is drawn above characters from the start.
    expect(screen.getAllByText('drawn above characters')).toHaveLength(2)
    await userEvent.click(screen.getByRole('button', { name: 'Toggle Objects above characters' }))
    expect(layers()?.[1]?.above).toBe(false)
    expect(screen.getAllByText('drawn above characters')).toHaveLength(1)
    await userEvent.click(screen.getByText('Overlay'))
    expect(harness.handle.store.getState().editorUi.selectedLayer).toBe(2)
  })

  it('adds and removes layers', async () => {
    const harness = createHarness()
    renderInApp(<MapToolPanel />, harness)
    await userEvent.click(screen.getByRole('button', { name: 'Add layer' }))
    expect(harness.handle.store.getState().project.data.maps[0]?.layers).toHaveLength(4)
    await userEvent.click(screen.getByRole('button', { name: 'Delete Layer 4' }))
    expect(harness.handle.store.getState().project.data.maps[0]?.layers).toHaveLength(3)
    harness.handle.store.dispatch(undo())
    expect(harness.handle.store.getState().project.data.maps[0]?.layers).toHaveLength(4)
  })

  it('cannot delete the last remaining layer', async () => {
    const harness = createHarness()
    renderInApp(<MapToolPanel />, harness)
    const layers = () => harness.handle.store.getState().project.data.maps[0]?.layers
    const button = (layer: string) =>
      screen.getByRole<HTMLButtonElement>('button', { name: `Delete ${layer}` })
    expect(button('Ground').disabled).toBe(false)
    await userEvent.click(button('Overlay'))
    await userEvent.click(button('Objects'))
    expect(layers()?.map((layer) => layer.name)).toEqual(['Ground'])
    expect(button('Ground').disabled).toBe(true)
  })
})

describe('PropertiesPanel', () => {
  const name = (harness: ReturnType<typeof createHarness>) =>
    harness.handle.store.getState().project.data.maps[0]?.name

  it('renames the map when the field is committed, as one undo step', async () => {
    const harness = createHarness()
    renderInApp(<PropertiesPanel />, harness)
    const field = screen.getByLabelText('Name', { selector: 'input' })
    await userEvent.clear(field)
    await userEvent.type(field, 'Harbour')
    expect(name(harness)).toBe('Town') // typing alone does not edit the project
    fireEvent.blur(field)
    expect(name(harness)).toBe('Harbour')
    expect(harness.handle.store.getState().history.past).toHaveLength(1)
    harness.handle.store.dispatch(undo())
    expect(name(harness)).toBe('Town')
  })

  it('keeps the old map name when the new one is blank', async () => {
    const harness = createHarness()
    renderInApp(<PropertiesPanel />, harness)
    const field = screen.getByLabelText('Name', { selector: 'input' })
    await userEvent.clear(field)
    await userEvent.type(field, '   {Enter}')
    expect(name(harness)).toBe('Town')
    expect(harness.handle.store.getState().project.data.maps[0]?.name).toBe('Town')
    // Nothing changed, so there is nothing to undo, and the field shows the stored name again.
    expect(harness.handle.store.getState().history.past).toHaveLength(0)
    // The field remounts, so look it up again rather than reading the old element.
    expect(screen.getByLabelText<HTMLInputElement>('Name', { selector: 'input' }).value).toBe(
      'Town',
    )
  })

  it('resizes the map, and explains why a resize that breaks a transfer is refused', async () => {
    const harness = createHarness()
    renderInApp(<PropertiesPanel />, harness)
    const width = screen.getByLabelText('Width')
    await userEvent.clear(width)
    await userEvent.type(width, '8{Enter}')
    expect(harness.handle.store.getState().project.data.maps[0]?.width).toBe(8)

    harness.handle.store.dispatch({ type: 'editorUi/mapSelected', payload: 2 })
    // Wait for the panel to show the Cave (its field remounts with the new value).
    await waitFor(() => {
      expect(screen.getByLabelText<HTMLInputElement>('Width').value).toBe('4')
    })
    const cave = screen.getByLabelText('Width')
    await userEvent.clear(cave)
    await userEvent.type(cave, '1{Enter}') // the Town door sends the player to (2, 2)
    expect(await screen.findByText(/outside map 2/)).toBeTruthy()
    expect(harness.handle.store.getState().project.data.maps[1]?.width).toBe(4)

    // The warning belongs to the map it was raised on and does not follow you to another.
    harness.handle.store.dispatch({ type: 'editorUi/mapSelected', payload: 1 })
    await waitFor(() => {
      expect(screen.getByLabelText<HTMLInputElement>('Name', { selector: 'input' }).value).toBe(
        'Town',
      )
    })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  describe('an impossible size', () => {
    const stored = (harness: ReturnType<typeof createHarness>) =>
      harness.handle.store.getState().project.data.maps[0]
    const enter = async (label: string, value: string) => {
      const field = screen.getByLabelText(label)
      await userEvent.clear(field)
      await userEvent.type(field, `${value}{Enter}`)
    }

    it('is refused with an explanation, leaving the map and the history alone', async () => {
      const harness = createHarness()
      renderInApp(<PropertiesPanel />, harness)
      await enter('Width', '600')
      expect(await screen.findByRole('alert')).toBeTruthy()
      expect(stored(harness)?.width).toBe(6)
      await enter('Width', '0')
      expect(await screen.findByRole('alert')).toBeTruthy()
      expect(stored(harness)?.width).toBe(6)
      expect(harness.handle.store.getState().history.past).toHaveLength(0)
    })

    it('puts the stored size back in the field', async () => {
      renderInApp(<PropertiesPanel />)
      await enter('Width', '600')
      expect(await screen.findByRole('alert')).toBeTruthy()
      expect(screen.getByLabelText<HTMLInputElement>('Width').value).toBe('6')
      // The field starts over each time, so a second refusal restores it too.
      await enter('Width', '0')
      await waitFor(() => {
        expect(screen.getByLabelText<HTMLInputElement>('Width').value).toBe('6')
      })
    })

    it('does not discard what was typed in the other size field', async () => {
      const harness = createHarness()
      renderInApp(<PropertiesPanel />, harness)
      // fireEvent: a real click would blur the field and commit the draft before the refusal.
      fireEvent.change(screen.getByLabelText('Height'), { target: { value: '5' } })
      await enter('Width', '600')
      expect(await screen.findByRole('alert')).toBeTruthy()
      expect(screen.getByLabelText<HTMLInputElement>('Width').value).toBe('6')
      expect(screen.getByLabelText<HTMLInputElement>('Height').value).toBe('5')
      expect(stored(harness)?.height).toBe(4)
    })

    it('stops being warned about once a valid size is entered', async () => {
      const harness = createHarness()
      renderInApp(<PropertiesPanel />, harness)
      await enter('Width', '600')
      expect(await screen.findByRole('alert')).toBeTruthy()
      await enter('Width', '22')
      await waitFor(() => {
        expect(screen.queryByRole('alert')).toBeNull()
      })
      expect(stored(harness)?.width).toBe(22)
    })
  })

  it('shows each map its own events', async () => {
    const harness = createHarness()
    renderInApp(<PropertiesPanel />, harness)
    const box = () => screen.getByLabelText<HTMLTextAreaElement>('Map events JSON')
    const apply = () => screen.getByRole<HTMLButtonElement>('button', { name: 'Apply events' })
    const select = async (mapId: number) => {
      harness.handle.store.dispatch({ type: 'editorUi/mapSelected', payload: mapId })
      await waitFor(() => {
        expect(screen.getByLabelText<HTMLInputElement>('Name', { selector: 'input' }).value).toBe(
          mapId === 1 ? 'Town' : 'Cave',
        )
      })
    }

    expect(JSON.parse(box().value)).toMatchObject([{ id: 1, name: 'Door' }])
    await select(2)
    expect(box().value).toBe('[]') // the Cave has no events: an empty list, nothing to apply
    expect(apply().disabled).toBe(true)

    fireEvent.change(box(), {
      target: { value: '[{"id":9,"name":"Elder","x":1,"y":1,"pages":[{}]}]' },
    })
    await userEvent.click(apply())
    await waitFor(() => {
      expect(JSON.parse(box().value)).toMatchObject([{ id: 9, name: 'Elder' }])
    })
    await select(1)
    expect(JSON.parse(box().value)).toMatchObject([{ id: 1, name: 'Door' }])
    await select(2)
    expect(JSON.parse(box().value)).toMatchObject([{ id: 9, name: 'Elder' }])
  })

  it('applies edited events, validating them first', async () => {
    const harness = createHarness()
    renderInApp(<PropertiesPanel />, harness)
    const box = screen.getByLabelText('Map events JSON')
    const apply = screen.getByRole<HTMLButtonElement>('button', { name: 'Apply events' })
    // It starts as the map's stored events, shown in canonical form, with nothing to apply.
    expect((box as HTMLTextAreaElement).value).toBe(
      JSON.stringify(harness.handle.store.getState().project.data.maps[0]?.events, null, 2),
    )
    expect(apply.disabled).toBe(true)

    fireEvent.change(box, { target: { value: '[{' } })
    expect(apply.disabled).toBe(false)
    await userEvent.click(apply)
    expect(await screen.findByText(/Not valid JSON/)).toBeTruthy()

    fireEvent.change(box, { target: { value: '[{"id":1,"x":0,"y":0,"pages":[],"evil":true}]' } })
    await userEvent.click(apply)
    expect(await screen.findByText(/events\.0/)).toBeTruthy()

    fireEvent.change(box, { target: { value: '[{"id":7,"x":99,"y":0,"pages":[{}]}]' } })
    await userEvent.click(apply)
    expect(await screen.findByText(/Event 7: .*outside/)).toBeTruthy()
    expect(harness.handle.store.getState().project.data.maps[0]?.events.map((e) => e.id)).toEqual([
      1,
    ])

    fireEvent.change(box, {
      target: {
        value: '[{"id":2,"x":1,"y":1,"pages":[{"commands":[{"command":"ShowText","text":"hi"}]}]}]',
      },
    })
    await userEvent.click(apply)
    await waitFor(() => {
      expect(harness.handle.store.getState().project.data.maps[0]?.events.map((e) => e.id)).toEqual(
        [2],
      )
    })
    expect(harness.handle.store.getState().history.past).toHaveLength(1) // removal and addition: one undo step
  })

  it('changes where the game starts', async () => {
    const harness = createHarness()
    renderInApp(<PropertiesPanel />, harness)
    const x = screen.getByLabelText('Start X')
    await userEvent.clear(x)
    await userEvent.type(x, '3{Enter}')
    expect(harness.handle.store.getState().project.data.meta.startX).toBe(3)
  })

  describe('game start', () => {
    const meta = (harness: ReturnType<typeof createHarness>) =>
      harness.handle.store.getState().project.data.meta
    const enter = async (label: string, value: string) => {
      const field = screen.getByLabelText(label)
      await userEvent.clear(field)
      await userEvent.type(field, `${value}{Enter}`)
    }

    it('shows the start map, position and project name', () => {
      renderInApp(<PropertiesPanel />)
      expect(screen.getByRole('combobox', { name: 'Start map' }).textContent).toBe('1. Town')
      expect(screen.getByLabelText<HTMLInputElement>('Start X').value).toBe('1')
      expect(screen.getByLabelText<HTMLInputElement>('Start Y').value).toBe('1')
      expect(screen.getByLabelText<HTMLInputElement>('Project name').value).toBe('Sample')
    })

    it('clamps a negative start position to zero', async () => {
      const harness = createHarness()
      renderInApp(<PropertiesPanel />, harness)
      await enter('Start X', '-5')
      expect(meta(harness).startX).toBe(0)
      expect(screen.queryByRole('alert')).toBeNull()
    })

    it('refuses a start position off the map, says why and restores the field', async () => {
      const harness = createHarness()
      renderInApp(<PropertiesPanel />, harness)
      await enter('Start X', '99')
      expect(await screen.findByText(/outside map 1/)).toBeTruthy()
      expect(meta(harness).startX).toBe(1)
      expect(screen.getByLabelText<HTMLInputElement>('Start X').value).toBe('1')
      expect(harness.handle.store.getState().history.past).toHaveLength(0)

      // A valid position afterwards clears the warning.
      await enter('Start X', '4')
      await waitFor(() => {
        expect(screen.queryByRole('alert')).toBeNull()
      })
      expect(meta(harness).startX).toBe(4)
      expect(harness.handle.store.getState().history.past).toHaveLength(1)
    })

    it('moves the start to another map and resets the position', async () => {
      const harness = createHarness()
      renderInApp(
        <>
          <MapToolPanel />
          <PropertiesPanel />
        </>,
        harness,
      )
      const deleteButton = (map: string) =>
        screen.getByRole<HTMLButtonElement>('button', { name: `Delete ${map}` })
      expect(deleteButton('Town').disabled).toBe(true)

      await userEvent.click(screen.getByRole('combobox', { name: 'Start map' }))
      await userEvent.click(await screen.findByRole('option', { name: '2. Cave' }))
      expect(meta(harness)).toMatchObject({ startMapId: 2, startX: 0, startY: 0 })
      // The new start map is protected from deletion; the old one no longer is.
      await waitFor(() => {
        expect(deleteButton('Cave').disabled).toBe(true)
      })
      expect(deleteButton('Town').disabled).toBe(false)
    })

    it('renames the project, which updates the title bar', async () => {
      const harness = createHarness()
      renderInApp(
        <>
          <MenuBar />
          <PropertiesPanel />
        </>,
        harness,
      )
      const title = () => screen.getByLabelText('Project name', { selector: 'p' })
      expect(title().textContent).toBe('Sample')
      const field = screen.getByRole('textbox', { name: 'Project name' })
      await userEvent.clear(field)
      await userEvent.type(field, 'Quest of Tests{Enter}')
      expect(meta(harness).name).toBe('Quest of Tests')
      await waitFor(() => {
        expect(title().textContent).toContain('Quest of Tests')
      })
    })

    it('keeps the project name when the new one is blank', async () => {
      const harness = createHarness()
      renderInApp(
        <>
          <MenuBar />
          <PropertiesPanel />
        </>,
        harness,
      )
      const field = screen.getByRole('textbox', { name: 'Project name' })
      await userEvent.clear(field)
      await userEvent.type(field, '  {Enter}')
      expect(meta(harness).name).toBe('Sample')
      expect(screen.getByLabelText('Project name', { selector: 'p' }).textContent).toContain(
        'Sample',
      )
      expect(harness.handle.store.getState().history.past).toHaveLength(0)
      expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Project name' }).value).toBe(
        'Sample',
      )
    })
  })
})
