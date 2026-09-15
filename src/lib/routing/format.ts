/** "4 min" / "1 hr 5 min" — walking time is the hero, so keep it short. */
export function formatWalkTime(durationSeconds: number): string {
  const minutes = Math.max(1, Math.round(durationSeconds / 60))
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest > 0 ? `${hours} hr ${rest} min` : `${hours} hr`
}

/** "300 m" / "1.2 km" — always the secondary detail. */
export function formatWalkDistance(distanceMeters: number): string {
  if (distanceMeters < 1000) {
    return `${Math.max(10, Math.round(distanceMeters / 10) * 10)} m`
  }
  return `${(distanceMeters / 1000).toFixed(1)} km`
}

/** Travel-mode-agnostic duration, e.g. "8 min" / "1 hr 5 min". */
export function formatDuration(durationSeconds: number): string {
  return formatWalkTime(durationSeconds)
}

/** Travel-mode-agnostic distance, e.g. "300 m" / "2.4 km". */
export function formatDistance(distanceMeters: number): string {
  return formatWalkDistance(distanceMeters)
}

/**
 * Short distance for turn-by-turn prompts: "now", "80 m", "1.2 km".
 * Rounds to the nearest 10 m so the number does not jitter while moving.
 */
export function formatTurnDistance(distanceMeters: number): string {
  if (distanceMeters < 15) return 'now'
  return formatWalkDistance(distanceMeters)
}

/** Clock time a duration from now lands on, e.g. "6:42 PM". */
export function formatArrivalClock(
  secondsFromNow: number,
  now: number = Date.now(),
): string {
  return new Date(now + secondsFromNow * 1000).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
}
