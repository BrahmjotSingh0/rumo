/**
 * Background Blur with Person Segmentation
 * Lightweight solution that blurs only the background, not the person
 * Uses TensorFlow.js BodyPix for accurate person detection
 */

let bodyPixLoaded = false
let bodyPixNet = null

// TF.js/BodyPix ship as classic (UMD-style) scripts that attach to `window`,
// not ES modules - loading them via `import()` silently fails (it treats the
// response as a module and finds no exports), so this loads them as real
// <script> tags instead, same as a plain HTML page would.
function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve()
      return
    }
    const script = document.createElement('script')
    script.src = src
    script.onload = () => resolve()
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`))
    document.head.appendChild(script)
  })
}

/**
 * Load BodyPix model (lightweight version)
 */
async function loadBodyPix() {
  if (bodyPixLoaded && bodyPixNet) return bodyPixNet

  try {
    if (!window.tf) {
      await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.11.0/dist/tf.min.js')
    }
    if (!window.bodyPix) {
      await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow-models/body-pix@2.2.0/dist/body-pix.min.js')
    }

    // Load the lightweight model
    bodyPixNet = await window.bodyPix.load({
      architecture: 'MobileNetV1',
      outputStride: 16,
      multiplier: 0.50, // Lighter model for performance
      quantBytes: 2
    })

    bodyPixLoaded = true
    console.log('✅ BodyPix model loaded successfully')
    return bodyPixNet
  } catch (error) {
    console.error('❌ Failed to load BodyPix:', error)
    throw error
  }
}

/**
 * Loads an image for use as a virtual background. Resolves to null (falls
 * back to blur) rather than rejecting, since a broken/unreachable image URL
 * shouldn't crash the call - it should just not replace the background.
 */
function loadBackgroundImage(url) {
  return new Promise((resolve) => {
    if (!url) {
      resolve(null)
      return
    }
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = url
  })
}

/**
 * Draws `image` into `ctx` covering the full width/height (like CSS
 * `background-size: cover`), cropping instead of stretching.
 */
function drawImageCover(ctx, image, width, height) {
  const imageRatio = image.width / image.height
  const targetRatio = width / height
  let drawWidth = width
  let drawHeight = height
  let offsetX = 0
  let offsetY = 0

  if (imageRatio > targetRatio) {
    drawHeight = height
    drawWidth = height * imageRatio
    offsetX = (width - drawWidth) / 2
  } else {
    drawWidth = width
    drawHeight = width / imageRatio
    offsetY = (height - drawHeight) / 2
  }

  ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight)
}

/**
 * Background Blur/Image Processor with Person Segmentation. With no
 * `backgroundImageUrl`, the background is blurred; with one, the person is
 * composited onto that image instead (a "virtual background").
 */
export class BackgroundBlurProcessor {
  constructor(blurAmount = 15, backgroundImageUrl = null) {
    this.blurAmount = blurAmount
    this.backgroundImageUrl = backgroundImageUrl
    this.backgroundImage = null
    this.canvas = document.createElement('canvas')
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: false })
    this.tempCanvas = document.createElement('canvas')
    this.tempCtx = this.tempCanvas.getContext('2d', { willReadFrequently: false })
    this.animationFrame = null
    this.isProcessing = false
    this.net = null
    this.segmentationConfig = {
      flipHorizontal: false,
      internalResolution: 'medium', // 'low', 'medium', 'high'
      segmentationThreshold: 0.7,
      maxDetections: 1,
      scoreThreshold: 0.2,
      nmsRadius: 20
    }
  }

  /**
   * Initialize and load the model (and the background image, if any)
   */
  async init() {
    if (!this.net) {
      this.net = await loadBodyPix()
    }
    if (this.backgroundImageUrl && !this.backgroundImage) {
      this.backgroundImage = await loadBackgroundImage(this.backgroundImageUrl)
    }
  }

  /**
   * Start processing video with background blur
   * @param {HTMLVideoElement} videoElement - Source video element
   * @returns {MediaStream} Processed video stream with blurred background
   */
  async start(videoElement) {
    await this.init()
    
    this.videoElement = videoElement
    this.canvas.width = videoElement.videoWidth || 640
    this.canvas.height = videoElement.videoHeight || 480
    this.tempCanvas.width = this.canvas.width
    this.tempCanvas.height = this.canvas.height
    
    this.isProcessing = true
    this.processFrame()
    
    return this.canvas.captureStream(30)
  }

  /**
   * Process each video frame with person segmentation
   */
  async processFrame() {
    if (!this.isProcessing || !this.videoElement || !this.net) return
    
    try {
      const width = this.canvas.width
      const height = this.canvas.height
      
      // Perform segmentation
      const segmentation = await this.net.segmentPerson(this.videoElement, this.segmentationConfig)

      // Fill temp canvas with whatever the background should be: the chosen
      // image (cover-fit) if one loaded, otherwise the blurred video.
      if (this.backgroundImage) {
        drawImageCover(this.tempCtx, this.backgroundImage, width, height)
      } else {
        this.tempCtx.filter = `blur(${this.blurAmount}px)`
        this.tempCtx.drawImage(this.videoElement, 0, 0, width, height)
        this.tempCtx.filter = 'none'
      }

      // Draw sharp original to main canvas
      this.ctx.drawImage(this.videoElement, 0, 0, width, height)

      // Get image data
      const originalData = this.ctx.getImageData(0, 0, width, height)
      const blurredData = this.tempCtx.getImageData(0, 0, width, height)
      const maskData = segmentation.data

      // Composite: person (sharp) + background (blurred or replacement image)
      const output = originalData.data
      const blurred = blurredData.data

      for (let i = 0; i < maskData.length; i++) {
        const isPerson = maskData[i] === 1
        const idx = i * 4

        if (!isPerson) {
          // Background - use blurred/replacement version
          output[idx] = blurred[idx]
          output[idx + 1] = blurred[idx + 1]
          output[idx + 2] = blurred[idx + 2]
        }
        // Person pixels stay sharp (already drawn)
      }
      
      this.ctx.putImageData(originalData, 0, 0)
      
    } catch (error) {
      console.error('Frame processing error:', error)
      // Fallback: just show original video
      this.ctx.drawImage(this.videoElement, 0, 0, this.canvas.width, this.canvas.height)
    }
    
    // Continue processing
    this.animationFrame = requestAnimationFrame(() => this.processFrame())
  }

  /**
   * Stop processing and cleanup
   */
  stop() {
    this.isProcessing = false
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame)
      this.animationFrame = null
    }
  }
}

/**
 * Simple fallback blur processor (lightweight, no ML)
 * Uses center-weighted mask - assumes person is in center
 */
export class SimpleBackgroundBlurProcessor {
  constructor(blurAmount = 15, backgroundImageUrl = null) {
    this.blurAmount = blurAmount
    this.backgroundImageUrl = backgroundImageUrl
    this.backgroundImage = null
    this.canvas = document.createElement('canvas')
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: false })
    this.blurCanvas = document.createElement('canvas')
    this.blurCtx = this.blurCanvas.getContext('2d', { willReadFrequently: false })
    this.animationFrame = null
    this.isProcessing = false
  }

  /**
   * Start processing video
   */
  async start(videoElement) {
    this.videoElement = videoElement
    this.canvas.width = videoElement.videoWidth || 640
    this.canvas.height = videoElement.videoHeight || 480
    this.blurCanvas.width = this.canvas.width
    this.blurCanvas.height = this.canvas.height

    if (this.backgroundImageUrl && !this.backgroundImage) {
      this.backgroundImage = await loadBackgroundImage(this.backgroundImageUrl)
    }

    this.isProcessing = true
    this.processFrame()

    return this.canvas.captureStream(30)
  }

  /**
   * Create elliptical mask (center = person, edges = background)
   */
  createMask(width, height) {
    const centerX = width / 2
    const centerY = height / 2
    const radiusX = width * 0.3  // 30% of width
    const radiusY = height * 0.4  // 40% of height
    
    const imageData = this.ctx.createImageData(width, height)
    const data = imageData.data
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const dx = (x - centerX) / radiusX
        const dy = (y - centerY) / radiusY
        const distance = Math.sqrt(dx * dx + dy * dy)
        
        // Smooth gradient from center (person) to edges (background)
        const alpha = Math.max(0, Math.min(1, 1.2 - distance))
        const idx = (y * width + x) * 4
        
        data[idx] = 255
        data[idx + 1] = 255
        data[idx + 2] = 255
        data[idx + 3] = alpha * 255  // Alpha channel for masking
      }
    }
    
    return imageData
  }

  /**
   * Process frame with center-based blur
   * Uses clipping path to keep center sharp, blur edges
   */
  processFrame() {
    if (!this.isProcessing || !this.videoElement) return
    
    const width = this.canvas.width
    const height = this.canvas.height
    
    try {
      // 1. Fill the background layer: chosen image (cover-fit) if one
      // loaded, otherwise a blurred copy of the video.
      if (this.backgroundImage) {
        drawImageCover(this.blurCtx, this.backgroundImage, width, height)
      } else {
        this.blurCtx.filter = `blur(${this.blurAmount}px)`
        this.blurCtx.drawImage(this.videoElement, 0, 0, width, height)
        this.blurCtx.filter = 'none'
      }

      // 2. Start with that background layer on the main canvas
      this.ctx.clearRect(0, 0, width, height)
      this.ctx.drawImage(this.blurCanvas, 0, 0)
      
      // 3. Draw sharp ellipse in center (where person usually is)
      const centerX = width / 2
      const centerY = height / 2.2 // Slightly higher (head is usually higher)
      const radiusX = width * 0.28
      const radiusY = height * 0.42
      
      this.ctx.save()
      
      // Create elliptical clipping path
      this.ctx.beginPath()
      this.ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI)
      this.ctx.closePath()
      this.ctx.clip()
      
      // Draw sharp video only in clipped area
      this.ctx.drawImage(this.videoElement, 0, 0, width, height)
      
      this.ctx.restore()
      
    } catch (error) {
      console.error('Simple blur error:', error)
      // Fallback: show original video
      this.ctx.clearRect(0, 0, width, height)
      this.ctx.drawImage(this.videoElement, 0, 0, width, height)
    }
    
    this.animationFrame = requestAnimationFrame(() => this.processFrame())
  }

  /**
   * Stop processing
   */
  stop() {
    this.isProcessing = false
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame)
      this.animationFrame = null
    }
  }
}
