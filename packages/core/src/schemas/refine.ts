import { type core } from 'zod'

export interface ValidationIssue {
  readonly path: readonly (string | number)[]
  readonly message: string
}

/**
 * Builds a Zod `check` from a pure function that lists the problems with a
 * value. Cross-field rules stay free of mutation; the single append Zod's
 * payload requires happens here.
 */
export const issuesCheck =
  <T>(validate: (value: T) => readonly ValidationIssue[]) =>
  (payload: core.ParsePayload<T>): void => {
    const issues = validate(payload.value).map(({ path, message }): core.$ZodRawIssue => ({
      code: 'custom',
      input: payload.value,
      path: [...path],
      message,
    }))
    // eslint-disable-next-line functional/immutable-data -- Zod's check API appends to its own payload
    payload.issues.push(...issues)
  }
