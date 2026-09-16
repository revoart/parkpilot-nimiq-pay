import {
  CreditCard,
  Database,
  MapPin,
  ShieldCheck,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react'

import { AppShell } from '@/components/layout/AppShell'
import { Card } from '@/components/ui/Card'

const SECTIONS: { title: string; body: string; icon: LucideIcon }[] = [
  {
    title: 'What ParkPilot stores',
    body: 'Your wallet address (public), an anonymous device identifier, and the reservations and payments you create. We do not collect your name, contacts, or personal files.',
    icon: Database,
  },
  {
    title: 'Location',
    body: 'Location is used only when you tap “Use my location” or “I’ve parked here”. It is used to sort nearby parking and to help you find your car. Saved parking locations stay on your device.',
    icon: MapPin,
  },
  {
    title: 'Analytics',
    body: 'Anonymous product events (for example, wallet connected or payment confirmed) help us understand whether ParkPilot works. They are tied to a random device identifier, not to your identity.',
    icon: TrendingUp,
  },
  {
    title: 'Payments',
    body: 'Payments are made directly from your wallet to the parking recipient as USDT on Polygon. ParkPilot never holds your funds and never has access to your private keys.',
    icon: CreditCard,
  },
  {
    title: 'Your control',
    body: 'You can disconnect your wallet at any time. Clearing saved locations removes them from your device. Because identity is wallet-based, no account deletion request is required.',
    icon: ShieldCheck,
  },
]

export function PrivacyScreen() {
  return (
    <AppShell showBack title="Privacy" showWallet={false}>
      <div className="space-y-3">
        {SECTIONS.map(({ title, body, icon: Icon }) => (
          <Card key={title} className="border border-line p-4">
            <div className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand/12 text-brand">
                <Icon className="size-[18px]" aria-hidden="true" />
              </span>
              <h2 className="text-[17px] font-bold tracking-[-0.2px]">
                {title}
              </h2>
            </div>
            <p className="mt-3 text-sm leading-5 text-ink-soft">{body}</p>
          </Card>
        ))}
        <p className="px-1 text-[13px] leading-[18px] text-ink-muted">
          ParkPilot was built for the Nimiq Mini Apps Competition. Listings,
          prices, reviews and availability all come from the live database, and
          distances and routes are calculated from your real location. Every
          listing is published by the host who owns the space, and every review
          is written by a driver who booked it.
        </p>
      </div>
    </AppShell>
  )
}
