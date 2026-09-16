import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

import { ParkPilotLogo } from '@/components/brand/Logo'
import { BottomNav } from '@/components/layout/BottomNav'
import { WalletPill } from '@/components/wallet/WalletPill'
import { cn } from '@/utils/cn'

interface AppShellProps {
  children: ReactNode
  title?: string
  showBack?: boolean
  showWallet?: boolean
  showNav?: boolean
  /** Optional header action, rendered before the wallet pill. */
  action?: ReactNode
  /**
   * Full-bleed layout for map-first screens (no padding). A `title` or
   * `showBack` still renders the header above the map.
   */
  bleed?: boolean
  className?: string
}

export function AppShell({
  children,
  title,
  showBack = false,
  showWallet = true,
  showNav = false,
  action,
  bleed = false,
  className,
}: AppShellProps) {
  const navigate = useNavigate()

  return (
    <div className="safe-top flex h-full min-h-full w-full flex-col bg-canvas">
      {!bleed || title || showBack ? (
        <header className="flex items-center justify-between gap-3 bg-canvas px-4 pb-2.5 pt-2.5">
          <div className="flex min-w-0 items-center gap-2">
            {showBack ? (
              <button
                type="button"
                aria-label="Back"
                onClick={() => navigate(-1)}
                className="-ml-2 flex size-9 items-center justify-center rounded-xl active:bg-surface"
              >
                <ArrowLeft className="size-[18px]" />
              </button>
            ) : null}
            {title ? (
              <h1 className="truncate text-[17px] font-bold tracking-[-0.2px]">
                {title}
              </h1>
            ) : (
              <ParkPilotLogo markClassName="h-5" />
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {action}
            {showWallet ? <WalletPill /> : null}
          </div>
        </header>
      ) : null}
      <main
        className={cn(
          bleed
            ? 'relative flex-1 overflow-hidden'
            : 'screen-enter flex-1 px-4 pb-6',
          className,
        )}
      >
        {children}
      </main>
      {showNav ? <BottomNav /> : null}
    </div>
  )
}
