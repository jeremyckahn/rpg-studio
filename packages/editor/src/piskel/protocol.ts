import { z } from 'zod'

/** Messages the editor sends to the embedded Piskel page, and the ones it sends back. */
export const HOST_SOURCE = 'rpgstudio'
export const ADAPTER_SOURCE = 'rpgstudio-piskel'

export const HostMessageSchema = z.discriminatedUnion('type', [
  z.strictObject({
    source: z.literal(HOST_SOURCE),
    type: z.literal('open'),
    requestId: z.string(),
    name: z.string(),
    /** The `.piskel` document as JSON text, including every layer and frame. */
    piskel: z.string(),
  }),
  z.strictObject({
    source: z.literal(HOST_SOURCE),
    type: z.literal('requestSave'),
    requestId: z.string(),
  }),
])
export type HostMessage = z.infer<typeof HostMessageSchema>

const PNG_DATA_URL = /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/

export const AdapterMessageSchema = z.discriminatedUnion('type', [
  z.strictObject({ source: z.literal(ADAPTER_SOURCE), type: z.literal('ready') }),
  z.strictObject({
    source: z.literal(ADAPTER_SOURCE),
    type: z.literal('opened'),
    requestId: z.string().optional(),
  }),
  z.strictObject({
    source: z.literal(ADAPTER_SOURCE),
    type: z.literal('saved'),
    requestId: z.string().optional(),
    piskel: z
      .string()
      .min(2)
      .max(64 * 1024 * 1024),
    /** Every frame, flattened across layers, side by side as one PNG. */
    png: z
      .string()
      .regex(PNG_DATA_URL)
      .max(64 * 1024 * 1024),
    width: z.int().min(1).max(4096),
    height: z.int().min(1).max(4096),
    frames: z.int().min(1).max(4096),
  }),
  z.strictObject({
    source: z.literal(ADAPTER_SOURCE),
    type: z.literal('error'),
    message: z.string().max(2000),
  }),
])
export type AdapterMessage = z.infer<typeof AdapterMessageSchema>
