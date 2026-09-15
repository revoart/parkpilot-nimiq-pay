import { AppShell } from '@/components/layout/AppShell'
import { Card } from '@/components/ui/Card'

const SECTIONS: { title: string; body: string }[] = [
  {
    title: 'What ParkPilot stores',
    body: 'Your wallet address (public), an anonymous device identifier, and the reservations and payments you create. We do not collect your name, contacts, or personal files.',
  },
  {
    title: 'Location',
    body: 'Location is used only when you tap “Use my location” or “I’ve parked here”. It is used to sort nearby parking and to help you find your car. Saved parking locations stay on your device.',
  },
  {
    title: 'Analytics',
    body: 'Anonymous product events (for example, wallet connected or payment confirmed) help us understand whether ParkPilot works. They are tied to a random device identifier, not to your identity.',
  },
  {
    title: 'Payments',
    body: 'Payments are made directly from your wallet to the parking recipient as USDT on Polygon. ParkPilot never holds your funds and never has access to your private keys.',
  },
  {
    title: 'Your control',
    body: 'You can disconnect your wallet at any time. Clearing saved locations removes them from your device. Because identity is wallet-based, no account deletion request is required.',
  },
]

export function PrivacyScreen() {
  return (
    <AppShell showBack title="Privacy">
      <div className="space-y-3">
        {SECTIONS.map((section) => (
          <Card key={section.title} className="space-y-1.5">
            <p className="text-sm font-semibold">{section.title}</p>
            <p className="text-xs text-ink-soft">{section.body}</p>
          </Card>
        ))}
        <p className="px-1 text-[11px] text-ink-muted">
          ParkPilot was built for the Nimiq Mini Apps Competition. Listings,
          prices, reviews and availability all come from the live database, and
          distances and routes are calculated from your real location. The
          listings currently published are demo host spaces, not commercial
          parking operators.
        </p>
      </div>
    </AppShell>
  )
}
