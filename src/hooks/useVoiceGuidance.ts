import { useCallback, useEffect, useRef, useState } from 'react'

const STORAGE_KEY = 'parkpilot.voice.enabled'

export interface VoiceGuidanceResult {
  /** The browser exposes the Speech Synthesis API. */
  supported: boolean
  enabled: boolean
  /** Speech is blocked until the user interacts — show an enable button. */
  needsUnlock: boolean
  setEnabled: (value: boolean) => void
  /** Speak a navigation phrase, replacing whatever is in progress. */
  speak: (text: string, options?: { force?: boolean }) => void
  /** Call from a click handler so autoplay policies are satisfied. */
  unlock: () => void
  cancel: () => void
  lastSpoken: string | null
}

/** Never repeat the same phrase inside this window. */
const REPEAT_WINDOW_MS = 9_000

function readEnabled(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === null ? true : stored === 'true'
  } catch {
    return true
  }
}

/**
 * Spoken turn-by-turn guidance.
 *
 * Deliberately small: it speaks only what the navigation engine asks it to, so
 * instructions are announced on distance thresholds rather than on every GPS
 * fix.
 */
export function useVoiceGuidance(): VoiceGuidanceResult {
  const supported =
    typeof window !== 'undefined' && 'speechSynthesis' in window

  const [enabled, setEnabledState] = useState(readEnabled)
  const [needsUnlock, setNeedsUnlock] = useState(false)
  const [lastSpoken, setLastSpoken] = useState<string | null>(null)

  const voice = useRef<SpeechSynthesisVoice | null>(null)
  const lastRef = useRef<{ text: string; at: number } | null>(null)
  const keepAlive = useRef<number | null>(null)

  // Prefer an English voice; the list arrives asynchronously in most browsers.
  useEffect(() => {
    if (!supported) return

    const pick = () => {
      const voices = window.speechSynthesis.getVoices()
      if (voices.length === 0) return
      voice.current =
        voices.find((item) => item.lang?.toLowerCase().startsWith('en-ca')) ??
        voices.find((item) => item.lang?.toLowerCase().startsWith('en-gb')) ??
        voices.find((item) => item.lang?.toLowerCase().startsWith('en')) ??
        voices[0] ??
        null
    }

    pick()
    window.speechSynthesis.addEventListener('voiceschanged', pick)
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', pick)
    }
  }, [supported])

  const stopKeepAlive = useCallback(() => {
    if (keepAlive.current !== null) {
      window.clearInterval(keepAlive.current)
      keepAlive.current = null
    }
  }, [])

  const cancel = useCallback(() => {
    if (!supported) return
    stopKeepAlive()
    window.speechSynthesis.cancel()
  }, [stopKeepAlive, supported])

  const setEnabled = useCallback(
    (value: boolean) => {
      setEnabledState(value)
      try {
        localStorage.setItem(STORAGE_KEY, String(value))
      } catch {
        // Preference simply does not persist.
      }
      if (!value) cancel()
      if (value) setNeedsUnlock(false)
    },
    [cancel],
  )

  const speak = useCallback(
    (text: string, options: { force?: boolean } = {}) => {
      if (!supported || !enabled) return
      const phrase = text.trim()
      if (!phrase) return

      const previous = lastRef.current
      if (
        !options.force &&
        previous &&
        previous.text === phrase &&
        Date.now() - previous.at < REPEAT_WINDOW_MS
      ) {
        return
      }

      try {
        window.speechSynthesis.cancel()

        const utterance = new SpeechSynthesisUtterance(phrase)
        utterance.lang = voice.current?.lang ?? 'en-CA'
        if (voice.current) utterance.voice = voice.current
        utterance.rate = 1
        utterance.pitch = 1
        utterance.volume = 1

        utterance.onstart = () => {
          setNeedsUnlock(false)
          // Chrome stalls long utterances; nudging it keeps navigation talking.
          stopKeepAlive()
          keepAlive.current = window.setInterval(() => {
            window.speechSynthesis.resume()
          }, 4_000)
        }

        utterance.onend = stopKeepAlive
        utterance.onerror = () => {
          stopKeepAlive()
          setNeedsUnlock(true)
        }

        lastRef.current = { text: phrase, at: Date.now() }
        setLastSpoken(phrase)
        window.speechSynthesis.speak(utterance)
      } catch {
        setNeedsUnlock(true)
      }
    },
    [enabled, stopKeepAlive, supported],
  )

  /** Called from a user gesture: clears the autoplay gate. */
  const unlock = useCallback(() => {
    if (!supported) return
    setNeedsUnlock(false)
    try {
      const utterance = new SpeechSynthesisUtterance(' ')
      utterance.volume = 0
      utterance.onend = () => {
        lastRef.current = null
      }
      window.speechSynthesis.speak(utterance)
    } catch {
      // Ignore — the next real prompt will try again.
    }
  }, [supported])

  useEffect(() => () => cancel(), [cancel])

  return {
    supported,
    enabled,
    needsUnlock,
    setEnabled,
    speak,
    unlock,
    cancel,
    lastSpoken,
  }
}
