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
