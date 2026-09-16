import { getSupabase } from '@/lib/supabase/client'
import type { Json } from '@/lib/supabase/database.types'

const DEVICE_KEY = 'parkpilot.device_id'

export type AppEventName =
  | 'app_opened'
  | 'wallet_connected'
  | 'parking_searched'
  | 'parking_viewed'
  | 'reservation_started'
  | 'payment_initiated'
  | 'payment_submitted'
  | 'payment_confirmed'
  | 'reservation_confirmed'
  | 'parking_pass_viewed'
  | 'find_my_car_used'
  | 'app_error'

interface TrackOptions {
  nimiqAddress?: string | null
  metadata?: Record<string, unknown>
}

/**
 * Anonymous, stable-per-device identifier. Falls back when
 * `crypto.randomUUID` is unavailable (HTTP on LAN is not a secure context).
 */
export function getAnonymousDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_KEY)
    if (existing) return existing

    const generated = createRandomId()
    localStorage.setItem(DEVICE_KEY, generated)
    return generated
  } catch {
    return createRandomId()
  }
}

function createRandomId(): string {
  const cryptoObj = globalThis.crypto
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID()
  }
  return `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Fire-and-forget analytics. Never throws — analytics must not break the app.
 */
export async function trackEvent(
  name: AppEventName,
  options: TrackOptions = {},
): Promise<void> {
  try {
    const supabase = getSupabase()
    await supabase.from('app_events').insert({
      event_name: name,
      anonymous_device_id: getAnonymousDeviceId(),
      nimiq_address: options.nimiqAddress ?? null,
      metadata: (options.metadata ?? {}) as Json,
    })
  } catch {
    // Intentionally ignored.
  }
}

/**
 * Report a crash or unhandled error so it is visible in `app_events` instead of
 * vanishing into the console. Fire-and-forget, never throws.
 */
export function reportError(
  error: unknown,
  context: Record<string, unknown> = {},
): void {
  const err = error instanceof Error ? error : new Error(String(error))

  void trackEvent('app_error', {
    metadata: {
      message: err.message.slice(0, 500),
      name: err.name,
      stack: (err.stack ?? '').slice(0, 2000),
      route:
        typeof window !== 'undefined' ? window.location.pathname : null,
      user_agent:
        typeof navigator !== 'undefined' ? navigator.userAgent : null,
      ...context,
    },
  })
}
