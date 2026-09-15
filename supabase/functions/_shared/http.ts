const BASE_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/**
 * Build CORS headers. Set ALLOWED_ORIGINS to a comma-separated list of origins
 * (the mini app's origin). Defaults to `*` when unset.
 */
export function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('origin')
  const configured = (Deno.env.get('ALLOWED_ORIGINS') ?? '*')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)

  let allowOrigin = '*'
  if (!configured.includes('*')) {
    allowOrigin =
      origin && configured.includes(origin) ? origin : (configured[0] ?? '*')
  }

  return {
    ...BASE_HEADERS,
    'Access-Control-Allow-Origin': allowOrigin,
    Vary: 'Origin',
  }
}

export function preflight(request: Request): Response | null {
  if (request.method !== 'OPTIONS') return null
  return new Response('ok', { headers: corsHeaders(request) })
}

export function json(
  request: Request,
  body: unknown,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request),
      'Content-Type': 'application/json',
    },
  })
}

export function errorResponse(
  request: Request,
  message: string,
  status = 400,
): Response {
  return json(request, { error: message }, status)
}
