import { z } from 'zod';

export const BridgeQueryTypeSchema = z.enum([
  'GET_MAP',
  'GET_ACTORS',
  'GET_FULL_STATE',
]);
export type BridgeQueryType = z.infer<typeof BridgeQueryTypeSchema>;

export const InboundBridgeMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('DISPATCH_ACTION'),
    action: z.object({
      type: z.string(),
      payload: z.unknown().optional(),
    }),
  }),
  z.object({
    type: z.literal('QUERY_STATE'),
    queryId: z.string(),
    queryType: BridgeQueryTypeSchema,
    params: z.record(z.string(), z.unknown()).optional(),
  }),
]);
export type InboundBridgeMessage = z.infer<typeof InboundBridgeMessageSchema>;

export const OutboundBridgeMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('HELLO'),
    client: z.literal('RPGStudioEditor'),
    version: z.string(),
  }),
  z.object({
    type: z.literal('QUERY_RESPONSE'),
    queryId: z.string(),
    success: z.boolean(),
    result: z.unknown().optional(),
    error: z.string().optional(),
  }),
]);
export type OutboundBridgeMessage = z.infer<typeof OutboundBridgeMessageSchema>;
