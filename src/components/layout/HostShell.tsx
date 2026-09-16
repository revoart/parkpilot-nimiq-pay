import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

import { HostNav } from '@/components/layout/HostNav'
import { WalletPill } from '@/components/wallet/WalletPill'
import { cn } from '@/utils/cn'

interface HostShellProps {
  children: ReactNode
  title?: string
  subtitle?: string
  showBack?: boolean
  showNav?: boolean
  className?: string
  headerRight?: ReactNode
}

export function HostShell({
  children,
  title,
  subtitle,
  showBack = false,
  showNav = true,
  className,
  headerRight,
}: HostShellProps) {
  const navigate = useNavigate()

  return (
    <div className="safe-top flex h-full min-h-full w-full flex-col bg-canvas">
      <header className="flex items-center justify-between gap-3 px-4 pb-2.5 pt-2.5">
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
          <div className="min-w-0">
            {subtitle ? (
              <p className="truncate text-[12px] font-medium text-ink-muted">
                {subtitle}
              </p>
            ) : null}
            {title ? (
              <h1 className="truncate text-[18px] font-bold tracking-[-0.3px]">
                {title}
              </h1>
            ) : null}
          </div>
        </div>
        {headerRight ?? <WalletPill />}
      </header>
      <main className={cn('screen-enter flex-1 px-4 pb-6', className)}>
        {children}
      </main>
      {showNav ? <HostNav /> : null}
    </div>
  )
}
