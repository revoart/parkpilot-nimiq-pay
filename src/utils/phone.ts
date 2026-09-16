/**
 * Phone number handling.
 *
 * Numbers are stored in one canonical shape so a `tel:` link is always
 * dialable: an optional leading `+` followed by 8–15 digits. Spaces, dashes,
 * brackets and dots are display sugar and are stripped.
 *
 * Nothing here guesses a country. If the user does not type a `+`, the number
 * is kept as entered rather than being prefixed with an assumed country code,
 * because guessing wrong would silently point calls at the wrong subscriber.
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

/**
 * A `tel:` href for a stored number.
 *
 * Rebuilt from the canonical digits rather than interpolated from raw input, so
 * nothing a user typed can end up in the href.
 */
export function telHref(phone: string | null | undefined): string | null {
  const normalized = normalizePhone(phone)
  return normalized ? `tel:${normalized}` : null
}

/** Group digits for readability, e.g. `+14165551234` → `+1 416 555 1234`. */
export function formatPhone(phone: string | null | undefined): string | null {
  const normalized = normalizePhone(phone)
  if (!normalized) return null

  const hasPlus = normalized.startsWith('+')
  const digits = hasPlus ? normalized.slice(1) : normalized

  // North American numbers get the familiar 3-3-4 grouping; everything else is
  // grouped in threes from the right, which reads acceptably without pretending
  // to know each country's convention.
  if (hasPlus && digits.length === 11 && digits.startsWith('1')) {
    return `+1 ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`
  }

  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return hasPlus ? `+${grouped}` : grouped
}
