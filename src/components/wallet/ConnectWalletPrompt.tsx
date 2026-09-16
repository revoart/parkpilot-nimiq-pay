import { Wallet } from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { useWallet } from '@/hooks/useWallet'

/**
 * Full-screen wallet gate. Centred rather than a card so it reads as a gate,
 * and kept compact enough to fit the 844px pass screen without scrolling.
 */
export function ConnectWalletPrompt({
  title,
  description,
}: {
  title: string
  description: string
}) {
  const wallet = useWallet()

  return (
    <div className="flex min-h-full flex-col items-center justify-center px-2 pb-8 text-center">
      <span className="flex size-24 items-center justify-center rounded-full border-2 border-brand/50 bg-brand/8">
        <Wallet className="size-9 text-brand" />
      </span>
      <h1 className="mt-5 text-[22px] font-extrabold tracking-[-0.4px]">
        {title}
      </h1>
      <p className="mt-2 max-w-[280px] text-[14px] leading-5 text-ink-muted">
        {description}
      </p>
      <Button
        full
        size="lg"
        className="mt-6 max-w-[320px]"
        onClick={() => void wallet.connect()}
        loading={wallet.status === 'connecting'}
      >
        Connect Wallet
      </Button>
    </div>
  )
}
