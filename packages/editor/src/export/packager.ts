import {
  GAME_BUNDLE_FORMAT,
  GAME_BUNDLE_FORMAT_VERSION,
  GAME_BUNDLE_FILE,
  type GameBundle,
  type Project,
  parsePluginManifest,
  projectToFiles,
  toJsonText,
} from '@rpgstudio/core'

/** Read access to the project's non-JSON files. */
export interface AssetReader {
  list: () => readonly string[]
  readBytes: (path: string) => Uint8Array | undefined
}

export interface ExportInput {
  readonly project: Project
  readonly assets: AssetReader
  /** The pre-built engine player, keyed by file name (e.g. `player.js`). */
  readonly engine: Readonly<Record<string, Uint8Array>>
}

export type ExportEntries = Readonly<Record<string, Uint8Array>>

export interface ExportResult {
  readonly entries: ExportEntries
  /** Files left out on purpose, with the reason, for display to the author. */
  readonly omitted: readonly { readonly path: string; readonly reason: string }[]
}

export class ExportError extends Error {
  override readonly name = 'ExportError'
  constructor(readonly problems: readonly string[]) {
    super(`The game cannot be exported:\n- ${problems.join('\n- ')}`)
  }
}

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif'] as const
const AUDIO_EXTENSIONS = ['ogg', 'mp3', 'm4a', 'wav'] as const

const extensionOf = (path: string): string => path.slice(path.lastIndexOf('.') + 1).toLowerCase()

const encoder = new TextEncoder()

/** The folder the engine player is served from inside an exported game. */
export const ENGINE_DIRECTORY = 'engine'

const escapeHtml = (text: string): string =>
  text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`)

/** The page that boots the game. No editor code is referenced from it. */
export const gameIndexHtml = (title: string): string =>
  `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no" />
    <title>${escapeHtml(title)}</title>
    <style>
      html, body { margin: 0; height: 100%; background: #000; overflow: hidden; }
      #game { width: 100%; height: 100%; }
    </style>
  </head>
  <body>
    <div id="game"></div>
    <script type="module">
      import { startPlayer } from './${ENGINE_DIRECTORY}/player.js'
      startPlayer(document.getElementById('game'))
    </script>
  </body>
</html>
`

interface Classified {
  readonly keep: readonly string[]
  readonly omitted: readonly { readonly path: string; readonly reason: string }[]
}

/** Images and audio ship; authoring sources (`.piskel`) and unknown files do not. */
const classifyAssets = (paths: readonly string[]): Classified => {
  const decisions = paths
    .filter((path) => !path.startsWith('plugins/'))
    .map((path) => {
      const extension = extensionOf(path)
      if (extension === 'piskel') return { path, reason: 'source art, not needed to play' }
      if (path.startsWith('img/') && (IMAGE_EXTENSIONS as readonly string[]).includes(extension)) {
        return { path, reason: null }
      }
      if (
        path.startsWith('audio/') &&
        (AUDIO_EXTENSIONS as readonly string[]).includes(extension)
      ) {
        return { path, reason: null }
      }
      return { path, reason: 'not a supported game asset type' }
    })
  return {
    keep: decisions.filter((d) => d.reason === null).map((d) => d.path),
    omitted: decisions.flatMap((d) =>
      d.reason === null ? [] : [{ path: d.path, reason: d.reason }],
    ),
  }
}

interface PluginFiles {
  readonly files: readonly string[]
  readonly omitted: readonly { readonly path: string; readonly reason: string }[]
  readonly problems: readonly string[]
}

/**
 * For each enabled plugin keeps `manifest.json` and the `shared` and `engine`
 * entries. The `editor` entry and anything else in the folder is stripped, so
 * editor UI code can never be reached from the exported game.
 */
const collectPlugins = (project: Project, assets: AssetReader): PluginFiles => {
  const decoder = new TextDecoder()
  const results = project.meta.plugins.map((id): PluginFiles => {
    const manifestPath = `plugins/${id}/manifest.json`
    const manifestBytes = assets.readBytes(manifestPath)
    if (!manifestBytes) {
      return {
        files: [],
        omitted: [],
        problems: [`Plugin "${id}" is enabled but ${manifestPath} is missing`],
      }
    }
    try {
      const manifest = parsePluginManifest(decoder.decode(manifestBytes))
      if (manifest.id !== id) {
        return {
          files: [],
          omitted: [],
          problems: [`${manifestPath} declares id "${manifest.id}", not "${id}"`],
        }
      }
      const missingDependency = manifest.dependencies.filter(
        (dep) => !project.meta.plugins.includes(dep),
      )
      const shipped = [manifest.entries.shared, manifest.entries.engine].filter(
        (entry): entry is string => entry !== undefined,
      )
      const present = shipped.filter((entry) => assets.readBytes(`plugins/${id}/${entry}`))
      const stripped = [...assets.list()].filter(
        (path) =>
          path.startsWith(`plugins/${id}/`) &&
          path !== manifestPath &&
          !shipped.some((entry) => path === `plugins/${id}/${entry}`),
      )
      return {
        files: [manifestPath, ...present.map((entry) => `plugins/${id}/${entry}`)],
        omitted: stripped.map((path) => ({ path, reason: 'editor-only plugin file' })),
        problems: [
          ...missingDependency.map((dep) => `Plugin "${id}" needs "${dep}", which is not enabled`),
          ...shipped
            .filter((entry) => !present.includes(entry))
            .map((entry) => `Plugin "${id}" lists plugins/${id}/${entry} but it is missing`),
        ],
      }
    } catch (error) {
      return {
        files: [],
        omitted: [],
        problems: [`${manifestPath}: ${error instanceof Error ? error.message : String(error)}`],
      }
    }
  })
  return {
    files: results.flatMap((r) => r.files),
    omitted: results.flatMap((r) => r.omitted),
    problems: results.flatMap((r) => r.problems),
  }
}

/**
 * Everything that would stop this project from running as a game: an enabled plugin that is
 * missing or invalid, and map tilesets that are not in the project. The exporter refuses on
 * these, and the editor's live preview shows them instead of a blank screen, so both agree.
 */
export const findGameProblems = (project: Project, assets: AssetReader): readonly string[] => {
  const classified = classifyAssets(assets.list())
  const missingTilesets = [...new Set(project.maps.map((map) => map.tileset))].filter(
    (tileset) => !classified.keep.includes(tileset),
  )
  return [
    ...collectPlugins(project, assets).problems,
    ...missingTilesets.map((tileset) => `A map uses ${tileset}, which is not in the project`),
  ]
}

/**
 * Decides what an exported game contains and assembles it in memory:
 * `index.html`, `game.json`, the project's JSON, images and audio, the
 * engine-facing parts of enabled plugins, and the pre-built engine player.
 * Authoring sources and editor-only code are left out.
 */
export const buildExportEntries = ({ project, assets, engine }: ExportInput): ExportResult => {
  const dataFiles = projectToFiles(project)
  const classified = classifyAssets(assets.list())
  const plugins = collectPlugins(project, assets)

  const problems = [
    ...findGameProblems(project, assets),
    ...(Object.keys(engine).length === 0
      ? ['The engine player is missing (run `pnpm build`)']
      : []),
  ]
  if (problems.length > 0) throw new ExportError(problems)

  const shippedAssets = [...classified.keep, ...plugins.files]
  const bundle: GameBundle = {
    format: GAME_BUNDLE_FORMAT,
    formatVersion: GAME_BUNDLE_FORMAT_VERSION,
    name: project.meta.name,
    files: [...Object.keys(dataFiles), ...shippedAssets],
    plugins: project.meta.plugins,
  }

  const entries: Record<string, Uint8Array> = {
    'index.html': encoder.encode(gameIndexHtml(project.meta.name)),
    [GAME_BUNDLE_FILE]: encoder.encode(toJsonText(bundle)),
    ...Object.fromEntries(
      Object.entries(dataFiles).map(([path, text]) => [path, encoder.encode(text)]),
    ),
    ...Object.fromEntries(
      shippedAssets.map((path) => [path, assets.readBytes(path) ?? new Uint8Array()] as const),
    ),
    ...Object.fromEntries(
      Object.entries(engine).map(([name, bytes]) => [`${ENGINE_DIRECTORY}/${name}`, bytes]),
    ),
  }
  return { entries, omitted: [...classified.omitted, ...plugins.omitted] }
}
