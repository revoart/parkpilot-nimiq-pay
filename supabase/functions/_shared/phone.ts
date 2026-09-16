/**
 * Phone normalisation for the Edge Functions.
 *
 * Mirrors `src/utils/phone.ts` on the client. The two runtimes are separate
 * (Deno vs the Vite bundle) so the logic is duplicated rather than shared — but
 * it must stay identical, because the client normalises before sending and the
 * database enforces `^\+?[0-9]{8,15}$` on top.
 */

const MIN_DIGITS = 8
const MAX_DIGITS = 15

/** Canonicalise user input, or null when it cannot be a phone number. */
export function normalizePhone(
  input: string | null | undefined,
): string | null {
  if (typeof input !== 'string') return null
  const trimmed = input.trim()
  if (!trimmed) return null

  const hasPlus = trimmed.startsWith('+')
  const digits = trimmed.replace(/\D/g, '')
  if (digits.length < MIN_DIGITS || digits.length > MAX_DIGITS) return null

  return hasPlus ? `+${digits}` : digits
}
