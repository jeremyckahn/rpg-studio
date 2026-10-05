const CHUNK = 0x8000

/** Encodes bytes as base64 without building a giant argument list. */
export const bytesToBase64 = (bytes: Uint8Array): string => {
  const chunks = Array.from({ length: Math.ceil(bytes.length / CHUNK) }, (_, i) =>
    String.fromCharCode(...bytes.subarray(i * CHUNK, (i + 1) * CHUNK)),
  )
  return btoa(chunks.join(''))
}

export const base64ToBytes = (text: string): Uint8Array =>
  Uint8Array.from(atob(text), (char) => char.charCodeAt(0))
