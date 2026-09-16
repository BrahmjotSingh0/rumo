import { useMemo } from 'react'

// Video quality presets
const VIDEO_QUALITY_PRESETS = {
  low: {
    width: { ideal: 640, max: 640 },
    height: { ideal: 360, max: 360 },
    frameRate: { ideal: 15, max: 20 }
  },
  medium: {
    width: { ideal: 1280, max: 1280 },
    height: { ideal: 720, max: 720 },
    frameRate: { ideal: 24, max: 30 }
  },
  high: {
    width: { ideal: 1920, max: 1920 },
    height: { ideal: 1080, max: 1080 },
    frameRate: { ideal: 30, max: 30 }
  },
  auto: {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30 }
  }
}

// Audio quality presets
const AUDIO_QUALITY_PRESETS = {
  low: {
    sampleRate: 16000,
    channelCount: 1,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true
  },
  medium: {
    sampleRate: 24000,
    channelCount: 1,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true
  },
  high: {
    sampleRate: 48000,
    channelCount: 2,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true
  },
  auto: {
    sampleRate: 48000, // High quality by default for auto
    channelCount: 1, // Mono for better compatibility
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true
  }
}

export const useMediaConstraints = (settings = {}) => {
  const videoConstraints = useMemo(() => {
    // Low-bandwidth mode overrides the quality dropdown - it's meant as a
    // single "my connection is bad" switch, not another quality tier to pick.
    const quality = settings.lowBandwidthMode ? 'low' : (settings.videoQuality || 'auto')
    const preset = VIDEO_QUALITY_PRESETS[quality] || VIDEO_QUALITY_PRESETS.auto

    return {
      ...preset,
      facingMode: settings.facingMode || 'user'
    }
  }, [settings.videoQuality, settings.facingMode, settings.lowBandwidthMode])

  const audioConstraints = useMemo(() => {
    const quality = settings.lowBandwidthMode ? 'low' : (settings.audioQuality || 'auto')
    const preset = AUDIO_QUALITY_PRESETS[quality] || AUDIO_QUALITY_PRESETS.auto

    // Apply noise suppression setting from user preferences
    return {
      ...preset,
      noiseSuppression: settings.noiseSuppression !== false, // Default to true
      echoCancellation: true,
      autoGainControl: true
    }
  }, [settings.audioQuality, settings.noiseSuppression, settings.lowBandwidthMode])

  return {
    videoConstraints,
    audioConstraints,
    getConstraints: (options = {}) => ({
      video: options.video !== false ? { ...videoConstraints, ...options.videoOverrides } : false,
      audio: options.audio !== false ? { ...audioConstraints, ...options.audioOverrides } : false
    })
  }
}

export { VIDEO_QUALITY_PRESETS, AUDIO_QUALITY_PRESETS }
