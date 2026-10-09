import {
  type AgentRequest,
  type JsonValue,
  type Project,
  type ProjectAction,
  ProjectActionSchema,
  type Result,
  base64ToBytes,
  fail,
  ok,
} from '@rpgstudio/core'

import { type AssetStore } from '../project/assetStore.ts'
import { applyProjectAction } from '../store/index.ts'
import { type EditorStoreHandle } from '../store/index.ts'
import { type PreviewHub, describePreview } from '../preview/previewHub.ts'
import { runQuery } from './queries.ts'

/** Largest asset an agent may write, after decoding. */
export const MAX_ASSET_BYTES = 12 * 1024 * 1024

/** Agents may add art and sound only; project data goes through validated actions. */
const WRITABLE = /^(?:img|audio)\/.+\.(?:png|jpe?g|gif|webp|ogg|mp3|m4a|wav|piskel)$/i

export interface CompanionHandlerDeps {
  readonly handle: EditorStoreHandle
  readonly assets: AssetStore
  readonly preview?: PreviewHub
}

export type CompanionHandler = (request: AgentRequest) => Result<JsonValue>

const describe = (action: unknown, index: number): string => {
  const type =
    typeof action === 'object' &&
    action !== null &&
    'type' in action &&
    typeof action.type === 'string'
      ? action.type
      : 'unknown action'
  return `Action ${index + 1} (${type})`
}

/**
 * Executes agent requests against the real editor. Untrusted input is validated
 * with Zod at this boundary: actions against `ProjectActionSchema`, queries
 * already by the transport, asset paths against an allow-list. A batch is
 * applied all-or-nothing and shares one history group, so a single Undo reverts
 * everything an agent did in one request.
 */
export const createCompanionHandler = ({
  handle,
  assets,
  preview,
}: CompanionHandlerDeps): CompanionHandler => {
  const { store } = handle
  const currentProject = (): Project => store.getState().project.data

  const apply = (inputs: readonly unknown[], group: string): Result<JsonValue> => {
    const checked = inputs.map((input, index) => ({
      input,
      index,
      result: ProjectActionSchema.safeParse(input),
    }))
    const invalid = checked.find(({ result }) => !result.success)
    if (invalid && !invalid.result.success) {
      const issue = invalid.result.error.issues[0]
      return fail(
        `${describe(invalid.input, invalid.index)} is invalid: ${issue ? `${issue.path.join('.') || 'action'}: ${issue.message}` : 'unknown error'}`,
      )
    }
    const parsed: ProjectAction[] = checked.flatMap(({ result }) =>
      result.success
        ? [{ ...result.data, meta: { historyGroup: result.data.meta?.historyGroup ?? group } }]
        : [],
    )

    // Dry run on a working copy so a failure halfway applies nothing.
    let working = currentProject()
    for (const [index, action] of parsed.entries()) {
      const result = applyProjectAction(working, action)
      if (!result.success) return fail(`${describe(action, index)} was refused: ${result.error}`)
      working = result.data
    }
    parsed.forEach((action) => {
      store.dispatch(action)
    })
    return ok({ applied: parsed.length, revision: store.getState().project.revision })
  }

  return (request) => {
    const group = `ai-${Date.now().toString(36)}-${request.id}`
    switch (request.kind) {
      case 'query': {
        const state = store.getState()
        return runQuery(
          {
            project: state.project.data,
            revision: state.project.revision,
            assets,
            ...(preview ? { preview: () => describePreview(preview.current()) } : {}),
          },
          request.query,
        )
      }
      case 'action':
        return apply([request.action], group)
      case 'batch':
        return apply(request.actions, group)
      case 'writeAsset': {
        if (!WRITABLE.test(request.path)) {
          return fail(
            `Agents may only write images, audio and .piskel files under img/ or audio/, not ${request.path}`,
          )
        }
        const bytes = base64ToBytes(request.data)
        if (bytes.length > MAX_ASSET_BYTES) return fail('The asset is too large')
        assets.write(request.path, bytes)
        return ok({ path: request.path, bytes: bytes.length })
      }
    }
  }
}
