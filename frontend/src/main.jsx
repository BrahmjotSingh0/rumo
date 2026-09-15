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

  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
