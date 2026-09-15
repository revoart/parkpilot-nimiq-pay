import { createClient } from 'npm:@supabase/supabase-js@2'

import { readToken, verifyToken } from '../_shared/auth.ts'
import { errorResponse, json, preflight } from '../_shared/http.ts'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/

interface RuleInput {
  weekday?: number
  start_time?: string
  end_time?: string
  active?: boolean
}

interface Body {
  evm_address?: string
  parking_space_id?: string
  rules?: RuleInput[]
}

/** Replaces a listing's weekly availability rules (host only). */
Deno.serve(async (request) => {
  const options = preflight(request)
  if (options) return options
  if (request.method !== 'POST') {
    return errorResponse(request, 'Method not allowed', 405)
  }

  try {
    const body = (await request.json().catch(() => null)) as Body | null
    if (!body) return errorResponse(request, 'Invalid JSON body.')
    if (!body.parking_space_id || !UUID_RE.test(body.parking_space_id)) {
      return errorResponse(request, 'Invalid parking space id.')
    }
    if (!Array.isArray(body.rules)) {
      return errorResponse(request, 'rules must be an array.')
    }

    const rules = body.rules.map((rule) => {
      const weekday = Number(rule.weekday)
      if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
        throw new Error('weekday must be 0-6.')
      }
      if (!rule.start_time || !TIME_RE.test(rule.start_time)) {
        throw new Error('Invalid start_time.')
      }
      if (!rule.end_time || !TIME_RE.test(rule.end_time)) {
        throw new Error('Invalid end_time.')
      }
      if (rule.end_time <= rule.start_time) {
        throw new Error('end_time must be after start_time.')
      }
      return {
        weekday,
        start_time: rule.start_time,
        end_time: rule.end_time,
        active: rule.active ?? true,
      }
    })

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const owner = await verifyToken(readToken(request, body))
    if (!owner) {
      return errorResponse(
        request,
        'Sign in with your wallet to continue.',
        401,
      )
    }

    const { data: existing, error: findError } = await supabase
      .from('parking_spaces')
      .select('id')
      .eq('id', body.parking_space_id)
      .ilike('owner_evm_address', owner)
      .maybeSingle()

    if (findError) throw findError
    if (!existing) {
      return errorResponse(request, 'Parking space not found.', 404)
    }

    const { error: clearError } = await supabase
      .from('parking_availability_rules')
      .delete()
      .eq('parking_space_id', body.parking_space_id)

    if (clearError) throw clearError

    if (rules.length > 0) {
      const { error: insertError } = await supabase
        .from('parking_availability_rules')
        .insert(
          rules.map((rule) => ({
            parking_space_id: body.parking_space_id,
            ...rule,
          })),
        )
      if (insertError) throw insertError
    }

    return json(request, { ok: true, count: rules.length })
  } catch (error) {
    console.error('set-availability failed', error)
    return errorResponse(
      request,
      error instanceof Error ? error.message : 'Unexpected error',
      400,
    )
  }
})
