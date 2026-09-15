import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { AlertTriangle, Check, Info } from 'lucide-react'

import { cn } from '@/utils/cn'

type ToastTone = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  message: string
  tone: ToastTone
}

interface ToastContextValue {
  show: (message: string, tone?: ToastTone) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const TONE_STYLES: Record<ToastTone, string> = {
  success: 'bg-success-bg text-success',
  error: 'bg-danger-bg text-danger',
  info: 'bg-surface-raised text-ink',
}

const TONE_ICON = {
  success: Check,
  error: AlertTriangle,
  info: Info,
}

const DISMISS_MS = 3200

/**
 * Lightweight feedback for actions that previously reported via inline text.
 * The container is a polite live region, so screen readers announce it too.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const nextId = useRef(1)

  const show = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = nextId.current++
    setItems((current) => [...current.slice(-2), { id, message, tone }])
    window.setTimeout(() => {
      setItems((current) => current.filter((item) => item.id !== id))
    }, DISMISS_MS)
  }, [])

  const value = useMemo(() => ({ show }), [show])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-20 z-[1600] flex flex-col items-center gap-2 px-4"
        role="status"
        aria-live="polite"
        aria-atomic="false"
      >
        {items.map((item) => {
          const Icon = TONE_ICON[item.tone]
          return (
            <div
              key={item.id}
              className={cn(
                'sheet-enter pointer-events-auto flex max-w-full items-center gap-2 rounded-xl px-3.5 py-2.5 text-[13px] font-semibold shadow-lg shadow-black/15',
                TONE_STYLES[item.tone],
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span className="min-w-0">{item.message}</span>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider.')
  }
  return context
}
