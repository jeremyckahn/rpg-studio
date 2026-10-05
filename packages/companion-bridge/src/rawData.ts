import { type RawData } from 'ws'

/** The text of a received WebSocket message, whatever shape `ws` delivered it in. */
export const rawDataToString = (data: RawData): string => {
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8')
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data)
  return data.toString('utf8')
}
