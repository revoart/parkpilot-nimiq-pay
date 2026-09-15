import { useEffect, useState } from 'react'

/** Announces a lost connection instead of failing silently. */
export function OfflineNotice() {
  const [offline, setOffline] = useState(
    () => typeof navigator !== 'undefined' && navigator.onLine === false,
  )

  useEffect(() => {
    const goOnline = () => setOffline(false)
    const goOffline = () => setOffline(true)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  if (!offline) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="safe-top sticky top-0 z-[1300] bg-warning-bg px-3 py-1.5 text-center text-[11px] font-bold uppercase tracking-wide text-warning"
    >
      You&apos;re offline — some things won&apos;t load
    </div>
  )
}
