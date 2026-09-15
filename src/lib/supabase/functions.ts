/**
 * Extract a useful message from a supabase-js `functions.invoke` error. The
 * Edge Function returns `{ error: string }` bodies, which live on
 * `error.context` as a Response.
 */
export async function readFunctionError(
  error: unknown,
  fallback: string,
): Promise<string> {
  const candidate = error as {
    message?: string
    context?: { json?: () => Promise<unknown> }
  }

  if (candidate?.context && typeof candidate.context.json === 'function') {
    try {
      const body = (await candidate.context.json()) as { error?: string }
      if (body?.error) return body.error
    } catch {
      // fall through to message
    }
  }

  return candidate?.message ?? fallback
}
