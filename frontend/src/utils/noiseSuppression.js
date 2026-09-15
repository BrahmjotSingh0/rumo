/**
 * Advanced Noise Suppression using Web Audio API
 * Implements a noise gate that only lets audio through above a threshold
 * Much more effective than browser's built-in noise suppression
 */

/**
 * Advanced Noise Gate Processor
 * Uses Web Audio API to implement aggressive noise suppression
 */
export class NoiseGateProcessor {
  constructor(threshold = -50, attackTime = 0.003, releaseTime = 0.25) {
    this.threshold = threshold // dB threshold (-50 to -30 works well)
    this.attackTime = attackTime // How quickly gate opens (seconds)
    this.releaseTime = releaseTime // How quickly gate closes (seconds)
    this.audioContext = null
    this.sourceNode = null
    this.analyser = null
    this.gainNode = null
    this.destination = null
    this.isGateOpen = false
    this.rafId = null
  }

  /**
   * Initialize the noise gate
   * @param {MediaStream} inputStream - Original audio stream
   * @returns {Promise<MediaStream>} - Processed audio stream with noise gate
   */
  async initialize(inputStream) {
    try {
      const audioTracks = inputStream.getAudioTracks()
      if (audioTracks.length === 0) {
        throw new Error('No audio tracks found')
      }

      // Create audio context
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 48000,
        latencyHint: 'interactive'
      })

      // Create nodes
      this.sourceNode = this.audioContext.createMediaStreamSource(inputStream)
      this.analyser = this.audioContext.createAnalyser()
      this.gainNode = this.audioContext.createGain()
      this.destination = this.audioContext.createMediaStreamDestination()

      // Configure analyser
      this.analyser.fftSize = 2048
      this.analyser.smoothingTimeConstant = 0.8

      // Connect nodes: source -> analyser -> gain -> destination
      this.sourceNode.connect(this.analyser)
      this.analyser.connect(this.gainNode)
      this.gainNode.connect(this.destination)

      // Start processing
      this.startProcessing()

      console.log('✅ Advanced noise gate initialized (threshold:', this.threshold, 'dB)')

      return this.destination.stream
    } catch (error) {
      console.error('❌ Failed to initialize noise gate:', error)
      throw error
    }
  }

  /**
   * Process audio and apply noise gate
   */
  startProcessing() {
    const dataArray = new Float32Array(this.analyser.fftSize)
    let currentGain = 0

    const process = () => {
      this.analyser.getFloatTimeDomainData(dataArray)

      // Calculate RMS (Root Mean Square) for volume level
      let sum = 0
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i] * dataArray[i]
      }
      const rms = Math.sqrt(sum / dataArray.length)
      
      // Convert to decibels
      const db = 20 * Math.log10(rms)

      // Determine if gate should be open or closed
      const shouldBeOpen = db > this.threshold

      // Smoothly transition gain
      if (shouldBeOpen) {
        // Attack - quickly open the gate
        currentGain += (1 - currentGain) * (1 - Math.exp(-1 / (this.attackTime * 60)))
        if (!this.isGateOpen) {
          this.isGateOpen = true
        }
      } else {
        // Release - slowly close the gate
        currentGain *= Math.exp(-1 / (this.releaseTime * 60))
        if (currentGain < 0.01) {
          currentGain = 0
          this.isGateOpen = false
        }
      }

      // Apply gain
      this.gainNode.gain.value = currentGain

      this.rafId = requestAnimationFrame(process)
    }

    process()
  }

  /**
   * Update the threshold
   * @param {number} threshold - New threshold in dB (-50 to -30)
   */
  setThreshold(threshold) {
    this.threshold = threshold
    console.log('🎚️ Noise gate threshold updated:', threshold, 'dB')
  }

  /**
   * Clean up resources
   */
  dispose() {
    try {
      if (this.rafId) {
        cancelAnimationFrame(this.rafId)
        this.rafId = null
      }

      if (this.sourceNode) {
        this.sourceNode.disconnect()
        this.sourceNode = null
      }

      if (this.analyser) {
        this.analyser.disconnect()
        this.analyser = null
      }

      if (this.gainNode) {
        this.gainNode.disconnect()
        this.gainNode = null
      }

      if (this.audioContext && this.audioContext.state !== 'closed') {
        this.audioContext.close()
        this.audioContext = null
      }

      this.isGateOpen = false
      console.log('✅ Noise gate disposed')
    } catch (error) {
      console.error('Error disposing noise gate:', error)
    }
  }
}

/**
 * NoiseSuppressor class - For compatibility
 */
export class NoiseSuppressor {
  constructor() {
    this.processor = null
    this.isInitialized = false
  }

  async initialize(inputStream) {
    this.processor = new NoiseGateProcessor(-45) // Moderate threshold
    const processedStream = await this.processor.initialize(inputStream)
    this.isInitialized = true
    return processedStream
  }

  setEnabled(enabled) {
    if (this.processor) {
      // When disabled, set threshold very low so everything passes through
      this.processor.setThreshold(enabled ? -45 : -80)
    }
  }

  dispose() {
    if (this.processor) {
      this.processor.dispose()
      this.processor = null
    }
    this.isInitialized = false
  }
}

/**
 * Simple fallback - no processing
 */
export class SimpleNoiseSuppressor {
  constructor() {
    this.enabled = true
  }

  async initialize(inputStream) {
    console.log('ℹ️ Using browser built-in noise suppression only')
    return inputStream
  }

  setEnabled(enabled) {
    this.enabled = enabled
  }

  dispose() {
    this.enabled = false
  }
}

/**
 * Factory function to create noise suppressor
 * @param {MediaStream} inputStream - Input audio stream
 * @param {boolean} useAdvanced - Use advanced noise gate (true) or browser only (false)
 * @returns {Promise<{stream: MediaStream, processor: Object}>}
 */
export async function createNoiseSuppressor(inputStream, useAdvanced = true) {
  let processor
  let outputStream

  try {
    if (useAdvanced) {
      processor = new NoiseGateProcessor(-45) // -45 dB threshold (good balance)
      outputStream = await processor.initialize(inputStream)
      console.log('🎯 Using advanced noise gate for strong noise suppression')
    } else {
      processor = new SimpleNoiseSuppressor()
      outputStream = await processor.initialize(inputStream)
    }

    return { stream: outputStream, processor }
  } catch (error) {
    console.error('Advanced noise suppression failed, falling back to simple:', error)
    
    // Fallback to simple
    processor = new SimpleNoiseSuppressor()
    outputStream = await processor.initialize(inputStream)
    
    return { stream: outputStream, processor }
  }
}
