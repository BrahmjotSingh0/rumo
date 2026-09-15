// Sound notification utility for meeting events

class SoundManager {
  constructor() {
    this.audioContext = null
    this.enabled = true
  }

  // Initialize Web Audio API context
  initAudioContext() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)()
    }
    return this.audioContext
  }

  // Play a beep sound with specified parameters
  playBeep(frequency, duration, volume = 0.3, type = 'sine') {
    if (!this.enabled) return

    try {
      const ctx = this.initAudioContext()
      const oscillator = ctx.createOscillator()
      const gainNode = ctx.createGain()

      oscillator.connect(gainNode)
      gainNode.connect(ctx.destination)

      oscillator.frequency.value = frequency
      oscillator.type = type
      gainNode.gain.value = volume

      // Fade in/out for smoother sound
      gainNode.gain.setValueAtTime(0, ctx.currentTime)
      gainNode.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.01)
      gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + duration)

      oscillator.start(ctx.currentTime)
      oscillator.stop(ctx.currentTime + duration)
    } catch (error) {
      console.error('Error playing sound:', error)
    }
  }

  // Play pleasant ascending chime (someone joins)
  playUserJoined() {
    const ctx = this.initAudioContext()
    const now = ctx.currentTime

    // Pleasant two-tone chime: E5 -> G5
    this.playTone(659.25, 0.15, 0.25, now)
    this.playTone(783.99, 0.2, 0.25, now + 0.1)
  }

  // Play welcoming sound (when you join)
  playYouJoined() {
    const ctx = this.initAudioContext()
    const now = ctx.currentTime

    // Welcoming three-tone chord: C5 -> E5 -> G5
    this.playTone(523.25, 0.15, 0.2, now)
    this.playTone(659.25, 0.15, 0.2, now + 0.08)
    this.playTone(783.99, 0.25, 0.2, now + 0.16)
  }

  // Play gentle descending tone (someone leaves)
  playUserLeft() {
    const ctx = this.initAudioContext()
    const now = ctx.currentTime

    // Gentle descending: G5 -> E5
    this.playTone(783.99, 0.15, 0.2, now)
    this.playTone(659.25, 0.2, 0.2, now + 0.1)
  }

  // Play subtle click (mic/camera toggle)
  playToggle() {
    this.playBeep(800, 0.05, 0.15, 'sine')
  }

  // Play notification sound (chat message)
  playChatMessage() {
    const ctx = this.initAudioContext()
    const now = ctx.currentTime

    // Quick notification: A5
    this.playTone(880, 0.1, 0.2, now)
  }

  // Play screen share start (ascending)
  playScreenShareStart() {
    const ctx = this.initAudioContext()
    const now = ctx.currentTime

    // Quick ascending: C5 -> G5
    this.playTone(523.25, 0.1, 0.2, now)
    this.playTone(783.99, 0.15, 0.2, now + 0.08)
  }

  // Play screen share stop (descending)
  playScreenShareStop() {
    const ctx = this.initAudioContext()
    const now = ctx.currentTime

    // Quick descending: G5 -> C5
    this.playTone(783.99, 0.1, 0.2, now)
    this.playTone(523.25, 0.15, 0.2, now + 0.08)
  }

  // Play join request notification (attention-grabbing but pleasant)
  playJoinRequest() {
    const ctx = this.initAudioContext()
    const now = ctx.currentTime

    // Attention-grabbing triple tone: A5 -> A5 -> C6
    this.playTone(880, 0.12, 0.25, now)
    this.playTone(880, 0.12, 0.25, now + 0.15)
    this.playTone(1046.5, 0.2, 0.25, now + 0.3)
  }

  // Helper to play a single tone
  playTone(frequency, duration, volume, startTime) {
    if (!this.enabled) return

    try {
      const ctx = this.audioContext || this.initAudioContext()
      const oscillator = ctx.createOscillator()
      const gainNode = ctx.createGain()

      oscillator.connect(gainNode)
      gainNode.connect(ctx.destination)

      oscillator.frequency.value = frequency
      oscillator.type = 'sine'

      // Smooth envelope
      gainNode.gain.setValueAtTime(0, startTime)
      gainNode.gain.linearRampToValueAtTime(volume, startTime + 0.01)
      gainNode.gain.linearRampToValueAtTime(volume * 0.7, startTime + duration * 0.5)
      gainNode.gain.linearRampToValueAtTime(0, startTime + duration)

      oscillator.start(startTime)
      oscillator.stop(startTime + duration)
    } catch (error) {
      console.error('Error playing tone:', error)
    }
  }

  // Enable/disable sounds
  setEnabled(enabled) {
    this.enabled = enabled
  }

  isEnabled() {
    return this.enabled
  }
}

// Export singleton instance
export const soundManager = new SoundManager()

// Export individual sound functions for convenience
export const playUserJoined = () => soundManager.playUserJoined()
export const playYouJoined = () => soundManager.playYouJoined()
export const playUserLeft = () => soundManager.playUserLeft()
export const playToggle = () => soundManager.playToggle()
export const playChatMessage = () => soundManager.playChatMessage()
export const playScreenShareStart = () => soundManager.playScreenShareStart()
export const playScreenShareStop = () => soundManager.playScreenShareStop()
export const playJoinRequest = () => soundManager.playJoinRequest()
