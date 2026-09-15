import { useEffect, useState } from 'react'

import {
  suggestAddresses,
  type AddressSuggestion,
} from '@/lib/places/autocomplete'

const DEBOUNCE_MS = 350
const MIN_LENGTH = 3

export function useAddressSuggestions(query: string): {
  suggestions: AddressSuggestion[]
  loading: boolean
} {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < MIN_LENGTH) {
      setSuggestions([])
      setLoading(false)
      return
    }

    const controller = new AbortController()
    setLoading(true)

    const timer = setTimeout(() => {
      suggestAddresses(trimmed, controller.signal)
        .then((results) => setSuggestions(results))
        .catch(() => setSuggestions([]))
        .finally(() => setLoading(false))
    }, DEBOUNCE_MS)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query])

  return { suggestions, loading }
}
