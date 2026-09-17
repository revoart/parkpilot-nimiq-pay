import { createClient } from 'npm:@supabase/supabase-js@2'

import { readToken, verifyToken } from '../_shared/auth.ts'
import { errorResponse, json, preflight } from '../_shared/http.ts'

interface Body {
  nimiq_address?: string
}

interface PaymentRow {
  status: string
  amount_nim: number | string
}

interface ReservationRow {
  id: string
  parking_space_id: string
  status: string
  start_at: string
  payments: PaymentRow[] | PaymentRow | null
}

Deno.serve(async (request) => {
  const options = preflight(request)
  if (options) return options
  if (request.method !== 'POST') {
    return errorResponse(request, 'Method not allowed', 405)
  }

  try {
    const body = (await request.json().catch(() => null)) as Body | null
    if (!body) return errorResponse(request, 'Invalid JSON body.')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Identity comes from the signed-in token, never from the request body.
    //
    // Trusting the body meant a listing created under the verified account was
    // looked up under whatever address the client happened to send, so a host
    // saw "no listings" while their listing was live. It also let anyone read
    // any host's spaces simply by naming them.
    const owner = await verifyToken(readToken(request, body))
    if (!owner) {
      return errorResponse(
        request,
        'Sign in with your account to continue.',
        401,
      )
    }

    const ownerKey = owner.toLowerCase()

    const { data: spaces, error: spaceError } = await supabase
      .from('parking_spaces')
      .select('*')
      .ilike('owner_nimiq_address', ownerKey)
      .order('created_at', { ascending: false })

    if (spaceError) throw spaceError

    const list = spaces ?? []
    if (list.length === 0) {
      return json(request, { spaces: [] })
    }

    const ids = list.map((space) => space.id)

    const { data: reservations, error: reservationError } = await supabase
      .from('reservations')
      .select(
        'id, parking_space_id, status, start_at, payments ( status, amount_nim )',
      )
      .in('parking_space_id', ids)

    if (reservationError) throw reservationError

    const now = Date.now()
    const stats = new Map<
      string,
      { bookings: number; upcoming: number; earned: number }
    >()

    for (const reservation of (reservations ?? []) as ReservationRow[]) {
      const entry = stats.get(reservation.parking_space_id) ?? {
        bookings: 0,
        upcoming: 0,
        earned: 0,
      }
      entry.bookings += 1

      if (
        reservation.status === 'reservation_confirmed' &&
        new Date(reservation.start_at).getTime() > now
      ) {
        entry.upcoming += 1
      }

      const payments = Array.isArray(reservation.payments)
        ? reservation.payments
        : reservation.payments
          ? [reservation.payments]
          : []
      for (const payment of payments) {
        if (payment.status === 'payment_confirmed') {
          entry.earned += Number(payment.amount_nim)
        }
      }

      stats.set(reservation.parking_space_id, entry)
    }

    const enriched = list.map((space) => {
      const stat = stats.get(space.id) ?? { bookings: 0, upcoming: 0, earned: 0 }
      return {
        ...space,
        stats: {
          bookings: stat.bookings,
          upcoming: stat.upcoming,
          earned: Number(stat.earned.toFixed(2)),
        },
      }
    })

    return json(request, { spaces: enriched })
  } catch (error) {
    console.error('list-host-spaces failed', error)
    return errorResponse(
      request,
      error instanceof Error ? error.message : 'Unexpected error',
      500,
    )
  }
})
