import { Bookmark, Car, Home, User } from 'lucide-react'
import { NavLink } from 'react-router-dom'

import { cn } from '@/utils/cn'

const ITEMS = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/my-parking', label: 'Bookings', icon: Car, end: false },
  { to: '/saved', label: 'Saved', icon: Bookmark, end: false },
  { to: '/profile', label: 'Profile', icon: User, end: false },
]

export function BottomNav() {
  return (
    <nav className="safe-bottom sticky bottom-0 z-[1100] border-t border-line bg-surface-raised/95 px-1 pb-2 pt-2 backdrop-blur-sm">
      <div className="flex">
        {ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'flex flex-1 flex-col items-center gap-[3px] py-1 transition-colors',
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
