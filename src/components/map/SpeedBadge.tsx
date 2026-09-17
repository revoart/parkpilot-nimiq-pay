import { useSpeedLimit } from '@/hooks/useSpeedLimit'

interface SpeedBadgeProps {
  position: { lat: number; lng: number } | null
  /** Device speed in metres per second, when the device reports it. */
  speedMps: number | null
}

const MPS_TO_KMH = 3.6
const MPS_TO_MPH = 2.23694

/**
 * The posted speed limit for the current road, with a live speed readout.
 *
 * Renders nothing when OSM has no limit for the road. A missing sign is not the
 * same as a limit of zero, and showing a guess next to a driver's speed would be
 * worse than showing nothing.
 */
export function SpeedBadge({ position, speedMps }: SpeedBadgeProps) {
  const limit = useSpeedLimit(position)

  if (!limit) return null

  const speed =
    speedMps === null || Number.isNaN(speedMps)
      ? null
      : Math.max(0, Math.round(speedMps * (limit.units === 'mph' ? MPS_TO_MPH : MPS_TO_KMH)))

  return (
    <div className="flex items-center gap-2">
      {/* European speed-limit sign: white disc, red ring, black numeral. */}
      <div
        className="flex size-12 shrink-0 items-center justify-center rounded-full border-[3px] border-red-600 bg-white shadow-sm shadow-black/10"
        role="img"
        aria-label={`Speed limit ${limit.limit} ${limit.units}`}
      >
        <span className="text-[17px] leading-none font-extrabold text-black">
          {limit.limit}
        </span>
      </div>

      {speed !== null ? (
        <div className="flex items-baseline gap-1 rounded-full border border-line bg-surface-raised/95 px-3 py-1.5 shadow-sm shadow-black/5 backdrop-blur-sm">
          <span className="text-[15px] leading-none font-bold text-ink">
            {speed}
          </span>
          <span className="text-[11px] leading-none font-semibold text-ink-muted">
            {limit.units}
          </span>
        </div>
      ) : null}

      {limit.road ? (
        <span className="truncate text-[11px] font-medium text-ink-muted">
          {limit.road}
        </span>
      ) : null}
    </div>
  )
}
