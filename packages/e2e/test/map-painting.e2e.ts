import { COLLISION_SOLID } from '../support/studio.ts'
import { expect, test } from '../support/fixtures.ts'

test.describe('tile palette', () => {
  test('selects a tile by clicking the tileset', async ({ page, studio }) => {
    await expect(studio.tilePalette).toBeVisible()
    await expect(page.getByText(/tile 1$/)).toBeVisible()

    await studio.pickTile(3)
    await expect(page.getByTestId('selected-tile')).toHaveCSS('left', '64px')

    // The palette wraps onto a second row, which continues the numbering.
    await studio.pickTile(9)
    // At 300% the map is wider than the canvas, so the outermost columns are scrolled out of view.
    await studio.clickCell({ x: 2, y: 2 })
    expect(await studio.tileAt(2, 2)).toBe(9)
  })
})

test.describe('pencil', () => {
  test('paints the selected tile on the selected layer under the pointer', async ({ studio }) => {
    await studio.pickTile(3)
    await studio.clickCell({ x: 4, y: 3 })

    expect(await studio.tileAt(4, 3)).toBe(3)
    // Neighbours and the other layers are untouched.
    expect(await studio.tileAt(3, 3)).toBe(1)
    expect(await studio.tileAt(5, 3)).toBe(1)
    expect(await studio.tileAt(4, 3, 1)).toBe(0)
  })

  test('undoes a whole stroke as one step and redoes it', async ({ studio }) => {
    await studio.pickTile(3)
    await studio.strokeCells([
      { x: 1, y: 1 },
      { x: 6, y: 1 },
    ])
    expect(await studio.tileAt(6, 1)).toBe(3)

    await studio.undo()
    for (let x = 1; x <= 6; x += 1) expect(await studio.tileAt(x, 1)).toBe(1)
    await studio.redo()
    for (let x = 1; x <= 6; x += 1) expect(await studio.tileAt(x, 1)).toBe(3)
  })

  test('paints on a different layer once it is selected', async ({ studio }) => {
    await studio.selectLayer('Objects')
    await studio.pickTile(7)
    await studio.clickCell({ x: 5, y: 5 })
    expect(await studio.tileAt(5, 5, 1)).toBe(7)
    expect(await studio.tileAt(5, 5, 0)).toBe(1)
  })

  test('changes the drawn picture and restores it on undo', async ({ studio }) => {
    const before = await studio.canvasImage()
    await studio.pickTile(3)
    await studio.strokeCells([
      { x: 2, y: 2 },
      { x: 12, y: 8 },
    ])
    await expect.poll(async () => (await studio.canvasImage()).equals(before)).toBe(false)
    await studio.undo()
    await expect.poll(async () => (await studio.canvasImage()).equals(before)).toBe(true)
  })
})

test.describe('eraser', () => {
  test('clears the tile on the selected layer only', async ({ studio }) => {
    await studio.dispatch({
      type: 'project/setTiles',
      payload: { mapId: 1, layer: 1, cells: [{ x: 3, y: 3, tile: 6 }] },
    })
    await studio.selectLayer('Objects')
    await studio.selectTool(/Eraser/)
    await studio.clickCell({ x: 3, y: 3 })
    expect(await studio.tileAt(3, 3, 1)).toBe(0)
    expect(await studio.tileAt(3, 3, 0)).toBe(1)
  })
})

test.describe('fill', () => {
  test('floods the whole connected region', async ({ studio }) => {
    await studio.pickTile(3)
    await studio.selectTool(/Fill/)
    await studio.clickCell({ x: 10, y: 7 })
    const ground = (await studio.map(1)).layers[0]?.data ?? []
    expect(ground).toHaveLength(300)
    expect(ground.every((tile) => tile === 3)).toBe(true)
  })

  test('is one undo step', async ({ studio }) => {
    await studio.pickTile(2)
    await studio.selectTool(/Fill/)
    await studio.clickCell({ x: 1, y: 1 })
    expect(await studio.tileAt(5, 5)).toBe(2)
    await studio.undo()
    expect(await studio.tileAt(5, 5)).toBe(1)
  })
})

test.describe('collision', () => {
  test('a click makes a cell solid and a second click clears it', async ({ studio }) => {
    await studio.selectTool(/Collision/)
    await studio.clickCell({ x: 6, y: 6 })
    expect(await studio.collisionAt(6, 6)).toBe(COLLISION_SOLID)
    await studio.clickCell({ x: 6, y: 6 })
    expect(await studio.collisionAt(6, 6)).toBe(0)
  })
})
