export type JsonPrimitive = string | number | boolean | null

/** A strictly JSON-serialisable value. */
export type JsonValue = JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue }
