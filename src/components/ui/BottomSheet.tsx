import { X } from 'lucide-react'
import type { ReactNode } from 'react'

import { Handle } from '@/components/ui/Handle'

export function BottomSheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
}) {
  if (!open) return null

  return (
    <div
      className="fade-in fixed inset-0 z-[1500] flex items-end justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="sheet-enter max-h-[80vh] w-full overflow-y-auto rounded-t-[22px] bg-surface-raised px-4 pb-6"
        onClick={(event) => event.stopPropagation()}
      >
        <Handle />
        <div className="mt-2 flex items-center justify-between">
          <h2 className="text-[17px] font-bold tracking-[-0.2px]">{title}</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-lg bg-surface"
          >
            <X className="size-4 text-ink-soft" />
          </button>
        </div>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  )
}
