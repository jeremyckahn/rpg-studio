// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { AssetBrowser, fileNameFor } from '../src/components/AssetBrowser'
import { MenuBar } from '../src/components/MenuBar'
import { createHarness, renderInApp } from './render'

/** What the Add menu offers: label, the folder it uploads into, and the picker's `accept`. */
const ADD_MENU = [
  { label: 'Tileset image', folder: 'img/tilesets', accept: 'image/png,image/gif,image/webp' },
  { label: 'Character sheet', folder: 'img/characters', accept: 'image/png,image/gif,image/webp' },
  {
    label: 'Picture',
    folder: 'img/pictures',
    accept: 'image/png,image/jpeg,image/gif,image/webp',
  },
  { label: 'Music (BGM)', folder: 'audio/bgm', accept: 'audio/*' },
  { label: 'Ambience (BGS)', folder: 'audio/bgs', accept: 'audio/*' },
  { label: 'Jingle (ME)', folder: 'audio/me', accept: 'audio/*' },
  { label: 'Sound effect (SE)', folder: 'audio/se', accept: 'audio/*' },
] as const

const chooseFromAddMenu = async (label: string): Promise<HTMLInputElement> => {
  await userEvent.click(screen.getByRole('button', { name: /Add/ }))
  await userEvent.click(await screen.findByRole('menuitem', { name: label }))
  return screen.getByLabelText<HTMLInputElement>('Upload assets')
}

describe('AssetBrowser Add menu', () => {
  it('offers every kind of asset', async () => {
    renderInApp(<AssetBrowser />)
    await userEvent.click(screen.getByRole('button', { name: /Add/ }))
    const items = await screen.findAllByRole('menuitem')
    expect(items.map((item) => item.textContent)).toEqual(ADD_MENU.map((kind) => kind.label))
  })

  it.each(ADD_MENU)('opens a $accept picker for "$label"', async ({ label, accept }) => {
    renderInApp(<AssetBrowser />)
    await chooseFromAddMenu(label)
    await waitFor(() => {
      expect(screen.getByLabelText('Upload assets').getAttribute('accept')).toBe(accept)
    })
  })

  it.each(ADD_MENU)('uploads a $label file into $folder', async ({ label, folder }) => {
    const harness = createHarness()
    renderInApp(<AssetBrowser />, harness)
    const input = await chooseFromAddMenu(label)
    // The picker's `accept` filters what the browser offers, not what `userEvent` may attach.
    await userEvent.upload(input, new File([Uint8Array.of(1, 2, 3)], 'file.bin'), {
      applyAccept: false,
    })
    await waitFor(() => {
      expect(harness.assets.list()).toEqual([`${folder}/file.bin`])
    })
    expect(Array.from(harness.assets.readBytes(`${folder}/file.bin`) ?? [])).toEqual([1, 2, 3])
  })

  it.each([
    ['my pic (final).png', 'my_pic_final_.png'],
    ['.hidden.png', 'hidden.png'],
    ['Ünï cødé!.png', '_n_c_d_.png'],
    ['../../evil/path\\name.png', 'name.png'],
    ['plain-name_1.v2.ogg', 'plain-name_1.v2.ogg'],
  ])('makes the file name "%s" safe: %s', (unsafe, safe) => {
    expect(fileNameFor(unsafe)).toBe(safe)
  })

  it('uploads a file with an unsafe name under its safe name', async () => {
    const harness = createHarness()
    renderInApp(<AssetBrowser />, harness)
    const input = await chooseFromAddMenu('Picture')
    await userEvent.upload(input, new File([Uint8Array.of(1)], 'Ünï cødé!.png'), {
      applyAccept: false,
    })
    await waitFor(() => {
      expect(harness.assets.list()).toEqual(['img/pictures/_n_c_d_.png'])
    })
  })
})

describe('MenuBar without folder support', () => {
  it('disables the folder commands and says why, leaving the zip commands enabled', async () => {
    expect('showDirectoryPicker' in window).toBe(false)
    renderInApp(<MenuBar />)
    await userEvent.click(screen.getByRole('button', { name: 'File' }))

    const open = await screen.findByRole('menuitem', { name: /Open folder/ })
    expect(open.getAttribute('aria-disabled')).toBe('true')
    expect(within(open).getByText('Not supported in this browser')).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: /Ctrl\+S/ }).getAttribute('aria-disabled')).toBe(
      'true',
    )
    expect(
      screen
        .getByRole('menuitem', { name: 'Save to another folder…' })
        .getAttribute('aria-disabled'),
    ).toBe('true')

    for (const name of ['New project', /Import project/, /Download project/, /Export game/]) {
      expect(screen.getByRole('menuitem', { name }).getAttribute('aria-disabled')).toBeNull()
    }
  })

  it('enables the folder commands when the browser can open folders', async () => {
    Reflect.defineProperty(window, 'showDirectoryPicker', {
      configurable: true,
      value: () => Promise.reject(new Error('unused')),
    })
    renderInApp(<MenuBar />)
    await userEvent.click(screen.getByRole('button', { name: 'File' }))
    const open = await screen.findByRole('menuitem', { name: /Open folder/ })
    expect(open.getAttribute('aria-disabled')).toBeNull()
    expect(screen.queryByText('Not supported in this browser')).toBeNull()
  })
})

describe('CompanionDialog', () => {
  const openDialog = async (harness = createHarness()) => {
    const connect = vi
      .spyOn(harness.services.companion, 'connect')
      .mockImplementation(() => undefined)
    renderInApp(<MenuBar />, harness)
    await userEvent.click(screen.getByRole('button', { name: 'Companion: off' }))
    const dialog = await screen.findByRole('dialog', { name: 'Companion bridge' })
    return { connect, dialog }
  }

  it('opens with the default address and an empty token', async () => {
    const { dialog, connect } = await openDialog()
    expect(within(dialog).getByLabelText<HTMLInputElement>('Server address').value).toBe(
      'ws://localhost:8080',
    )
    const token = within(dialog).getByLabelText<HTMLInputElement>('Token (optional)')
    expect(token.value).toBe('')
    expect(token.type).toBe('password')
    expect(
      within(dialog).getByRole<HTMLButtonElement>('button', { name: 'Disconnect' }).disabled,
    ).toBe(true)
    expect(within(dialog).getByText('pnpm dev:companion')).toBeTruthy()
    expect(connect).not.toHaveBeenCalled()
  })

  it('closes without connecting', async () => {
    const { dialog, connect } = await openDialog()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
    expect(connect).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Companion: off' })).toBeTruthy()
  })

  it('rejects an address that is not a WebSocket URL, staying open and not connecting', async () => {
    const { dialog, connect } = await openDialog()
    fireEvent.change(within(dialog).getByLabelText('Server address'), {
      target: { value: 'http://localhost:8080' },
    })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Connect' }))
    expect(within(dialog).getByRole('alert').textContent).toContain(
      'must start with ws:// or wss://',
    )
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(connect).not.toHaveBeenCalled()
  })

  it('rejects text that is not a URL at all, staying open and not connecting', async () => {
    const { dialog, connect } = await openDialog()
    fireEvent.change(within(dialog).getByLabelText('Server address'), {
      target: { value: 'not a url' },
    })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Connect' }))
    expect(within(dialog).getByRole('alert').textContent).not.toBe('')
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(connect).not.toHaveBeenCalled()
  })

  it('connects with the typed address and token, then closes', async () => {
    const { dialog, connect } = await openDialog()
    fireEvent.change(within(dialog).getByLabelText('Server address'), {
      target: { value: 'ws://localhost:9999' },
    })
    fireEvent.change(within(dialog).getByLabelText('Token (optional)'), {
      target: { value: 'secret' },
    })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Connect' }))
    expect(connect).toHaveBeenCalledExactlyOnceWith({ url: 'ws://localhost:9999', token: 'secret' })
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
  })
})
