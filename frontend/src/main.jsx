import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { loadBranding } from './config/branding'
import { applyTheme } from './utils/theme'

// Branding (name/logo/tagline/color) can be re-configured per-deployment via
// public/branding.json with no rebuild - fetch it before the first render so
// every component sees the final values immediately.
loadBranding().then((branding) => {
  applyTheme(branding.primaryColor)

  // Embedding (docs/EMBEDDING.md) is opt-out, not opt-in, since most
  // self-hosters are fine with it - but an operator can turn it off from
  // /admin, and this is what actually enforces that: bounce out of the
  // frame instead of silently rendering inside someone else's page.
  if (branding.features.embedding === false && window.self !== window.top) {
    try {
      window.top.location = window.location.href
    } catch {
      // Cross-origin parent that also blocks navigating it - fall back to a
      // plain message instead of rendering the app inside it regardless.
      document.getElementById('root').innerHTML =
        '<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui,sans-serif;color:#94a3b8;background:#0f172a;text-align:center;padding:2rem;">This instance does not allow embedding in other sites.</div>'
    }
    return
  }

  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
