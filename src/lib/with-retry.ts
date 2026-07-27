// Small retry-with-backoff helper for transient failures (Resend rate
// limits / 5xx, network blips). Non-retryable errors (bad request, bad API
// key, invalid recipient, etc.) fail fast instead of wasting attempts.

// Resend's ErrorResponse.name is one of these known error codes. Anything
// NOT in this list (e.g. a raw network/fetch failure with no `name`, or an
// unrecognized shape) is treated as retryable, since it's more likely to be
// transient than a permanent rejection.
const RESEND_ERROR_NAME_IS_RETRYABLE: Record<string, boolean> = {
  missing_required_field: false,
  invalid_access: false,
  invalid_parameter: false,
  invalid_region: false,
  rate_limit_exceeded: true,
  missing_api_key: false,
  invalid_api_Key: false,
  invalid_from_address: false,
  validation_error: false,
  not_found: false,
  method_not_allowed: false,
  application_error: true,
  internal_server_error: true,
}

function isRetryable(error: unknown): boolean {
  const name =
    error && typeof error === 'object' && 'name' in error
      ? (error as { name?: string }).name
      : undefined

  if (typeof name === 'string' && name in RESEND_ERROR_NAME_IS_RETRYABLE) {
    return RESEND_ERROR_NAME_IS_RETRYABLE[name]
  }

  return true
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  { attempts = 3, baseDelayMs = 500 }: { attempts?: number; baseDelayMs?: number } = {}
): Promise<T> {
  let lastError: unknown

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error

      if (attempt === attempts || !isRetryable(error)) {
        throw error
      }

      const delayMs = baseDelayMs * 2 ** (attempt - 1)
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }

  throw lastError
}
