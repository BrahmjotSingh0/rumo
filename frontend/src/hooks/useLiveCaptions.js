import { useEffect, useRef, useState } from 'react'

// Wraps the browser's built-in SpeechRecognition (Web Speech API). Entirely
// local to the browser - no audio is ever sent to a server for this, unlike
// most captioning setups. It only transcribes the local microphone; getting
// captions for what everyone else says relies on each participant relaying
// their own transcript to the room over the 'send-caption' socket event.
export const useLiveCaptions = ({ enabled, language = 'en-US', onResult }) => {
  const recognitionRef = useRef(null)
  const onResultRef = useRef(onResult)
  onResultRef.current = onResult

  const [supported] = useState(() => (
    typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition)
  ))

  useEffect(() => {
    if (!enabled || !supported) return

    const SpeechRecognitionImpl = window.SpeechRecognition || window.webkitSpeechRecognition
    const recognition = new SpeechRecognitionImpl()
    recognition.continuous = true
    recognition.interimResults = false
    recognition.lang = language

    recognition.onresult = (event) => {
      const result = event.results[event.results.length - 1]
      if (result.isFinal) {
        const text = result[0].transcript.trim()
        if (text) onResultRef.current?.(text)
      }
    }

    recognition.onerror = () => {
      // no-speech/network errors are common and transient - onend below
      // restarts recognition, nothing useful to surface to the user here.
    }

    recognition.onend = () => {
      // Browsers stop recognition after a period of silence - restart it
      // for as long as captions are still turned on.
      if (recognitionRef.current === recognition) {
        try {
          recognition.start()
        } catch {
          // ignore - already running or being torn down
        }
      }
    }

    recognitionRef.current = recognition
    try {
      recognition.start()
    } catch {
      // ignore
    }

    return () => {
      recognitionRef.current = null
      recognition.onend = null
      recognition.onresult = null
      recognition.stop()
    }
  }, [enabled, supported, language])

  return { supported }
}
