/** Thrown when a plugin touches a capability its manifest did not declare. */
export class CapabilityDeniedError extends Error {
  override readonly name = 'CapabilityDeniedError'
  constructor(
    readonly pluginId: string,
    readonly capability: string,
  ) {
    super(`Plugin "${pluginId}" did not declare the "${capability}" capability in its manifest`)
  }
}

/** Thrown when a plugin tries something its manifest or the host forbids. */
export class PluginPolicyError extends Error {
  override readonly name = 'PluginPolicyError'
  constructor(
    readonly pluginId: string,
    message: string,
  ) {
    super(`Plugin "${pluginId}": ${message}`)
  }
}

/** Thrown when a manifest or module fails validation at registration or load. */
export class PluginRegistrationError extends Error {
  override readonly name = 'PluginRegistrationError'
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
  }
}

export class PluginDependencyError extends Error {
  override readonly name = 'PluginDependencyError'
  constructor(message: string) {
    super(message)
  }
}

export class PluginInitializationError extends Error {
  override readonly name = 'PluginInitializationError'
  constructor(
    readonly pluginId: string,
    options?: ErrorOptions,
  ) {
    super(`Plugin "${pluginId}" failed to initialize`, options)
  }
}
