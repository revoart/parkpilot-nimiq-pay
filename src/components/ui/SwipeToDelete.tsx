import { useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { Trash2 } from 'lucide-react'

import { cn } from '@/utils/cn'
import { haptic } from '@/utils/haptics'

interface SwipeToDeleteProps {
  children: ReactNode
  onDelete: () => void
  /** Accessible name for the revealed action. */
  label?: string
  className?: string
  disabled?: boolean
}

const ACTION_WIDTH = 84
const COMMIT_RATIO = 0.4
/** Movement before we decide whether the gesture is a swipe or a scroll. */
const AXIS_LOCK_PX = 10

/**
 * Swipe left to reveal a delete action.
 *
 * - `touch-action: pan-y` means vertical scrolling is never hijacked.
 * - The gesture only engages once it is clearly horizontal, so tapping still
 *   works normally.
 * - The action is a real, focusable button, so keyboard and screen-reader users
 *   are not forced to swipe.
 */
export function SwipeToDelete({
  children,
  onDelete,
  label = 'Delete',
  className,
  disabled = false,
}: SwipeToDeleteProps) {
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const origin = useRef<{ x: number; y: number } | null>(null)
  const axis = useRef<'x' | 'y' | null>(null)

  function handleDown(event: PointerEvent<HTMLDivElement>) {
    if (disabled) return
    origin.current = { x: event.clientX, y: event.clientY }
    axis.current = null
  }

  function handleMove(event: PointerEvent<HTMLDivElement>) {
    if (!origin.current || disabled) return
    const dx = event.clientX - origin.current.x
    const dy = event.clientY - origin.current.y

    if (!axis.current) {
      if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return
      axis.current = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
      if (axis.current === 'x') {
        setDragging(true)
        event.currentTarget.setPointerCapture(event.pointerId)
      }
    }

    if (axis.current !== 'x') return
    setOffset(Math.max(-ACTION_WIDTH, Math.min(0, dx)))
  }

  function handleUp() {
    if (axis.current === 'x') {
      const commit = Math.abs(offset) > ACTION_WIDTH * COMMIT_RATIO
      setDragging(false)
      setOffset(commit ? -ACTION_WIDTH : 0)
    }
    origin.current = null
    axis.current = null
  }

  return (
    <div className={cn('relative overflow-hidden rounded-2xl', className)}>
      <button
        type="button"
        aria-label={label}
        onClick={() => {
          haptic()
          setOffset(0)
          onDelete()
        }}
        className="absolute inset-y-0 right-0 flex w-[84px] flex-col items-center justify-center gap-1 bg-danger-bg text-danger"
      >
        <Trash2 className="size-4" />
        <span className="text-[11px] font-bold">{label}</span>
      </button>

      <div
        className={cn('relative', !dragging && 'transition-transform duration-200')}
        style={{ transform: `translateX(${offset}px)`, touchAction: 'pan-y' }}
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerCancel={handleUp}
        onClickCapture={(event) => {
          // While open, the first tap closes instead of activating the row.
          if (offset !== 0) {
            event.preventDefault()
            event.stopPropagation()
            setOffset(0)
          }
        }}
      >
        {children}
      </div>
    </div>
  )
}
