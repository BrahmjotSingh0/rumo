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
  noiseSuppression: true, // Enable by default
  compactMode: false,
  backgroundOptimization: true // Enable background optimization by default
}

export const useSettings = () => {
  const [settings, setSettings] = useState(() => {
    const saved = localStorage.getItem('meeting-settings')
    const parsedSettings = saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS
    
    // Always reset background blur on initialization (should not persist across meetings)
    parsedSettings.backgroundBlur = false
    
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