/**
 * Background blur using canvas-based blur effect
 * This is a simplified implementation that works without ML models
 */

class BackgroundBlurProcessor {
  constructor() {
    this.canvas = null
    this.ctx = null
    this.blurAmount = 15
    this.initialized = false
  }

  initialize(width, height) {
    if (this.initialized) return

    this.canvas = document.createElement('canvas')
    this.canvas.width = width
    this.canvas.height = height
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })
    this.initialized = true
  }

  applyBlur(imageData) {
    if (!this.ctx) return imageData

    // Apply a simple box blur
    const pixels = imageData.data
    const width = imageData.width
    const height = imageData.height
    const radius = this.blurAmount
    
    // Create a copy for processing
    const copy = new Uint8ClampedArray(pixels)
    
    // Horizontal blur pass
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let r = 0, g = 0, b = 0, a = 0, count = 0
        
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx
          if (nx >= 0 && nx < width) {
            const idx = (y * width + nx) * 4
            r += copy[idx]
            g += copy[idx + 1]
            b += copy[idx + 2]
            a += copy[idx + 3]
            count++
          }
        }
        
        const idx = (y * width + x) * 4
        pixels[idx] = r / count
        pixels[idx + 1] = g / count
        pixels[idx + 2] = b / count
        pixels[idx + 3] = a / count
      }
    }
    
    // Vertical blur pass
    const copy2 = new Uint8ClampedArray(pixels)
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        let r = 0, g = 0, b = 0, a = 0, count = 0
        
        for (let dy = -radius; dy <= radius; dy++) {
          const ny = y + dy
          if (ny >= 0 && ny < height) {
            const idx = (ny * width + x) * 4
            r += copy2[idx]
            g += copy2[idx + 1]
            b += copy2[idx + 2]
            a += copy2[idx + 3]
            count++
          }
        }
        
        const idx = (y * width + x) * 4
        pixels[idx] = r / count
        pixels[idx + 1] = g / count
        pixels[idx + 2] = b / count
        pixels[idx + 3] = a / count
      }
    }
    
    return imageData
  }

  processFrame(videoElement, outputCanvas) {
    if (!videoElement || !outputCanvas) return
    
    const width = videoElement.videoWidth
    const height = videoElement.videoHeight
    
    if (width === 0 || height === 0) return
    
    // Initialize if needed
    if (!this.initialized || this.canvas.width !== width || this.canvas.height !== height) {
      this.initialize(width, height)
    }
    
    // Set output canvas size
    outputCanvas.width = width
    outputCanvas.height = height
    const outputCtx = outputCanvas.getContext('2d')
    
    // Draw video frame to processing canvas
    this.ctx.drawImage(videoElement, 0, 0, width, height)
    
    // Get image data
    const imageData = this.ctx.getImageData(0, 0, width, height)
    
    // Apply blur
    const blurred = this.applyBlur(imageData)
    
    // Put blurred image to output canvas
    outputCtx.putImageData(blurred, 0, 0)
  }

  destroy() {
    this.canvas = null
    this.ctx = null
    this.initialized = false
  }
}

// Optimized version using CSS blur filter (simpler and more performant)
export class SimpleBackgroundBlurProcessor {
  constructor(blurIntensity = 10) {
    this.blurIntensity = blurIntensity
    this.canvas = null
    this.ctx = null
    this.animationId = null
    this.sourceVideo = null
  }

  async start(videoElement) {
    if (!videoElement) return null
    
    this.sourceVideo = videoElement
    
    // Create canvas for processing
    this.canvas = document.createElement('canvas')
    this.ctx = this.canvas.getContext('2d')
    
    // Start processing loop
    this.processFrame()
    
    // Create stream from canvas
    const stream = this.canvas.captureStream(30) // 30 fps
    return stream
  }

  processFrame() {
    if (!this.sourceVideo || !this.canvas || !this.ctx) return
    
    const video = this.sourceVideo
    
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      const width = video.videoWidth
      const height = video.videoHeight
      
      if (width > 0 && height > 0) {
        this.canvas.width = width
        this.canvas.height = height
        
        // Apply CSS filter for blur effect (GPU accelerated)
        this.ctx.filter = `blur(${this.blurIntensity}px)`
        this.ctx.drawImage(video, 0, 0, width, height)
        
        // Reset filter
        this.ctx.filter = 'none'
      }
    }
    
    // Continue processing
    this.animationId = requestAnimationFrame(() => this.processFrame())
  }

  stop() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId)
      this.animationId = null
    }
    
    if (this.canvas) {
      const stream = this.canvas.captureStream()
      stream.getTracks().forEach(track => track.stop())
    }
    
    this.canvas = null
    this.ctx = null
    this.sourceVideo = null
  }
}

export default BackgroundBlurProcessor
