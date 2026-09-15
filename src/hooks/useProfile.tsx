import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import { useWallet } from '@/hooks/useWallet'
import { getProfile, updateProfile, uploadAvatar, type Profile } from '@/lib/profile'

interface ProfileContextValue {
  profile: Profile | null
  loading: boolean
  error: string | null
  /** Saves the shared name/bio. Visible in both Driver and Host. */
  save: (input: {
    displayName?: string | null
    bio?: string | null
  }) => Promise<void>
  /** Uploads and persists the shared profile photo. */
  setAvatar: (file: File) => Promise<void>
  refresh: () => Promise<void>
}

const ProfileContext = createContext<ProfileContextValue | null>(null)

/**
 * One identity for the whole app. Driver and Host both read from here, so a
 * change made in one mode is instantly visible in the other.
 */
export function ProfileProvider({ children }: { children: ReactNode }) {
  const wallet = useWallet()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!wallet.address) {
      setProfile(null)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      setProfile(await getProfile(wallet.address))
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not load your profile.',
      )
    } finally {
      setLoading(false)
    }
  }, [wallet.address])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const save = useCallback(
    async (input: { displayName?: string | null; bio?: string | null }) => {
      if (!wallet.address) throw new Error('Connect your wallet first.')
      setProfile(await updateProfile(wallet.address, input))
    },
    [wallet.address],
  )

  const setAvatar = useCallback(
    async (file: File) => {
      if (!wallet.address) throw new Error('Connect your wallet first.')
      const url = await uploadAvatar(wallet.address, file)
      setProfile(await updateProfile(wallet.address, { avatarUrl: url }))
    },
    [wallet.address],
  )

  const value = useMemo<ProfileContextValue>(
    () => ({ profile, loading, error, save, setAvatar, refresh }),
    [profile, loading, error, save, setAvatar, refresh],
  )

  return (
    <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
  )
}

export function useProfile(): ProfileContextValue {
  const context = useContext(ProfileContext)
  if (!context) {
    throw new Error('useProfile must be used within a ProfileProvider.')
  }
  return context
}
