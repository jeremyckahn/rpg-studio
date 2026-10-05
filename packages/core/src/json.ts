export type JsonPrimitive = string | number | boolean | null

/** A strictly JSON-serialisable value. */
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }
