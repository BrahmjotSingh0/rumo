import { useState, useEffect } from 'react'

const DEFAULT_SETTINGS = {
  theme: 'dark',
  layout: 'grid',
  showParticipantNames: true,
  showConnectionQuality: true,
  autoHideControls: true,
  chatPosition: 'right',
  videoQuality: 'auto',
  audioQuality: 'auto',
  backgroundBlur: false,
  backgroundImage: null, // URL of a virtual background (preset or uploaded); overrides backgroundBlur when set
  noiseSuppression: true, // Enable by default
  compactMode: false,
  backgroundOptimization: true, // Enable background optimization by default
  mirrorLocalVideo: true, // Flip your own preview horizontally (does not affect what others see)
  hideSelfView: false, // Hide your own tile from your own view
  lowBandwidthMode: false, // Forces the lowest video/audio quality preset regardless of the dropdowns
  liveCaptions: false // Local, browser-only speech-to-text overlay (see useLiveCaptions)
}

export const useSettings = () => {
  const [settings, setSettings] = useState(() => {
    const saved = localStorage.getItem('meeting-settings')
    const parsedSettings = saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS
    
    // Always reset background blur/image on initialization (should not persist across meetings)
    parsedSettings.backgroundBlur = false
    parsedSettings.backgroundImage = null

    return parsedSettings
  })

  const updateSetting = (key, value) => {
    setSettings(prev => {
      const newSettings = { ...prev, [key]: value }
      localStorage.setItem('meeting-settings', JSON.stringify(newSettings))
      return newSettings
    })
  }

  const resetSettings = () => {
    setSettings(DEFAULT_SETTINGS)
    localStorage.setItem('meeting-settings', JSON.stringify(DEFAULT_SETTINGS))
  }

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.theme)
    document.documentElement.setAttribute('data-compact', settings.compactMode)
  }, [settings.theme, settings.compactMode])

  return { settings, updateSetting, resetSettings }
}