import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type AppMode = 'driver' | 'host'

const KEY = 'parkpilot.mode'

interface AppModeContextValue {
  mode: AppMode
  setMode: (mode: AppMode) => void
}

const AppModeContext = createContext<AppModeContextValue | null>(null)

export function AppModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<AppMode>('driver')

  useEffect(() => {
    try {
      const stored = localStorage.getItem(KEY)
      if (stored === 'host' || stored === 'driver') setModeState(stored)
    } catch {
      // ignore
    }
  }, [])

  const setMode = useCallback((next: AppMode) => {
    setModeState(next)
    try {
      localStorage.setItem(KEY, next)
    } catch {
      // ignore
    }
  }, [])

  const value = useMemo(() => ({ mode, setMode }), [mode, setMode])

  return (
    <AppModeContext.Provider value={value}>{children}</AppModeContext.Provider>
  )
}

export function useAppMode(): AppModeContextValue {
  const context = useContext(AppModeContext)
  if (!context) {
    throw new Error('useAppMode must be used within an AppModeProvider.')
  }
  return context
}
