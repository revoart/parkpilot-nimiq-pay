import { CalendarCheck, LayoutGrid, TrendingUp, User } from 'lucide-react'
import { NavLink } from 'react-router-dom'

import { cn } from '@/utils/cn'

const ITEMS = [
  { to: '/host', label: 'Dashboard', icon: LayoutGrid, end: true },
  { to: '/host/bookings', label: 'Bookings', icon: CalendarCheck, end: false },
  { to: '/host/earnings', label: 'Earnings', icon: TrendingUp, end: false },
  { to: '/profile', label: 'Profile', icon: User, end: false },
]

/**
 * `sticky bottom-0` lives on the shell's footer wrapper so the nav and a pinned
 * CTA share one bottom stack. The safe-area inset stays here, on the element
 * that paints the background: applied outside it, the inset renders as a blank
 * strip below the nav's own border.
 *
 * Note `safe-bottom` sets `padding-bottom` outright, and being unlayered CSS it
 * beats Tailwind's layered `pb-*` utilities. A `pb-*` here would be dead code,
 * so the vertical rhythm comes from the padding above and the item padding.
 */
export function HostNav() {
  return (
    <nav className="safe-bottom safe-bottom-tight border-t border-line bg-surface-raised/95 px-1 pt-0.5 backdrop-blur-sm">
      <div className="flex">
        {ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                // Bottom padding trimmed rather than the bar's top: the nav is
                // bottom-anchored, so only the space *below* the icon moves it.
                'flex flex-1 flex-col items-center gap-[2px] pt-0.5 transition-colors',
                isActive ? 'text-ink' : 'text-ink-faint',
              )
            }
          >
            <Icon className="size-[22px]" />
            <span className="text-[10px] font-semibold tracking-wide">
              {label}
            </span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
