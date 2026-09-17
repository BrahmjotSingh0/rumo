import { useEffect, useState } from 'react'
import { API_BASE_URL } from '../utils/constants'

// Remembers the last version the person dismissed a notice for, so it
// doesn't nag on every visit - but reappears automatically once a *further*
// release comes out, since that's a new, undismissed notice.
const DISMISS_KEY = 'rumo_dismissed_update_version'

export function useVersionCheck() {
  const [info, setInfo] = useState(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    let cancelled = false

    fetch(`${API_BASE_URL}/api/version`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return
        setInfo(data)
        try {
          setDismissed(data.latest && localStorage.getItem(DISMISS_KEY) === data.latest)
        } catch {
          // private browsing etc - just don't remember the dismissal
        }
      })
      .catch(() => {
        // Backend unreachable or version checks disabled server-side -
        // updateAvailable just stays false, no error shown to the user.
      })

    return () => {
      cancelled = true
    }
  }, [])

  const dismiss = () => {
    setDismissed(true)
    try {
      if (info?.latest) localStorage.setItem(DISMISS_KEY, info.latest)
    } catch {
      // ignore
    }
  }

  return {
    updateAvailable: Boolean(info?.updateAvailable) && !dismissed,
    current: info?.current || null,
    latest: info?.latest || null,
    releaseUrl: info?.releaseUrl || null,
    dismiss
  }
}
