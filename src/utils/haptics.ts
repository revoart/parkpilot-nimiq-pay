/**
 * Best-effort haptics. The Vibration API is unavailable in some WebViews and
 * requires a secure context, so every call is a silent no-op when unsupported.
 */
export function haptic(pattern: number | number[] = 8): void {
  try {
    if (typeof navigator === 'undefined') return
    if (typeof navigator.vibrate !== 'function') return
    navigator.vibrate(pattern)
  } catch {
    // unsupported — never break an interaction over feedback
  }
}

/** A slightly stronger pulse for confirmations (payment, publish, payout). */
export function hapticConfirm(): void {
  haptic([12, 40, 12])
}
