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

// BodyPix's mask is binary (0/1 per pixel) - compositing on that directly
// gives a hard, jagged, blocky edge around the person (exactly the bad cutout
// look this feathering exists to fix). These turn it into a smooth alpha by
// box-blurring the mask a few passes, which approximates a gaussian feather
// cheaply via a sliding-window sum (cost per row/column is independent of
// the blur radius).
function boxBlurHorizontal(src, dst, width, height, radius) {
  const windowSize = radius * 2 + 1
  for (let y = 0; y < height; y++) {
    const rowStart = y * width
    let sum = 0
    for (let k = -radius; k <= radius; k++) {
      sum += src[rowStart + Math.min(width - 1, Math.max(0, k))]
    }
    for (let x = 0; x < width; x++) {
      dst[rowStart + x] = sum / windowSize
      const addX = Math.min(width - 1, x + radius + 1)
      const removeX = Math.max(0, x - radius)
      sum += src[rowStart + addX] - src[rowStart + removeX]
    }
  }
}

function boxBlurVertical(src, dst, width, height, radius) {
  const windowSize = radius * 2 + 1
  for (let x = 0; x < width; x++) {
    let sum = 0
    for (let k = -radius; k <= radius; k++) {
      sum += src[Math.min(height - 1, Math.max(0, k)) * width + x]
    }
    for (let y = 0; y < height; y++) {
      dst[y * width + x] = sum / windowSize
      const addY = Math.min(height - 1, y + radius + 1)
      const removeY = Math.max(0, y - radius)
      sum += src[addY * width + x] - src[removeY * width + x]
    }
  }
}

// Mutates `mask` (a Float32Array of 0-255 values) in place. Two full box-blur
// passes (each a horizontal + vertical pair) approximates a gaussian feather
// well enough for this without needing a real gaussian kernel.
function featherMask(mask, width, height, radius) {
  const temp = new Float32Array(mask.length)
  boxBlurHorizontal(mask, temp, width, height, radius)
  boxBlurVertical(temp, mask, width, height, radius)
  boxBlurHorizontal(mask, temp, width, height, radius)
  boxBlurVertical(temp, mask, width, height, radius)
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
      internalResolution: 'high', // 'low', 'medium', 'high' - higher gives a more accurate mask boundary before feathering
      segmentationThreshold: 0.7,
      maxDetections: 1,
      scoreThreshold: 0.2,
      nmsRadius: 20
    }
    this.featherRadius = 6 // px, at the mask's own resolution (= canvas size)
    this.maskBuffer = null
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
      const pixelCount = width * height

      // Turn the binary per-pixel mask into a soft alpha (see featherMask
      // above) so the composite below blends smoothly across the person's
      // outline instead of a hard, jagged, one-pixel-wide cutoff.
      if (!this.maskBuffer || this.maskBuffer.length !== pixelCount) {
        this.maskBuffer = new Float32Array(pixelCount)
      }
      for (let i = 0; i < pixelCount; i++) {
        this.maskBuffer[i] = maskData[i] === 1 ? 255 : 0
      }
      featherMask(this.maskBuffer, width, height, this.featherRadius)

      // Composite: person (sharp) blended with background (blurred or
      // replacement image) proportionally to how "person-ish" the feathered
      // mask says this pixel is.
      const output = originalData.data
      const blurred = blurredData.data

      for (let i = 0; i < pixelCount; i++) {
        const alpha = this.maskBuffer[i] / 255
        if (alpha >= 1) continue // fully person - original is already sharp there
        const idx = i * 4
        const bgWeight = 1 - alpha
        output[idx] = output[idx] * alpha + blurred[idx] * bgWeight
        output[idx + 1] = output[idx + 1] * alpha + blurred[idx + 1] * bgWeight
        output[idx + 2] = output[idx + 2] * alpha + blurred[idx + 2] * bgWeight
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
   * Process frame with center-based blur. Blends the sharp video with the
   * blurred/replacement background using the soft elliptical alpha from
   * createMask() above, instead of a hard clip() - a fixed clip path was
   * giving this fallback the same jagged-edge look the real segmentation
   * path had before it got feathering, just around a plain oval instead of
   * an actual person outline.
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

      // 2. Sharp video, full frame, onto the main canvas
      this.ctx.drawImage(this.videoElement, 0, 0, width, height)

      // 3. The mask is the same every frame for a given size, so build it
      // once and reuse it instead of recomputing a per-pixel gradient 30
      // times a second.
      if (!this.mask || this.mask.width !== width || this.mask.height !== height) {
        this.mask = this.createMask(width, height)
      }

      const originalData = this.ctx.getImageData(0, 0, width, height)
      const blurredData = this.blurCtx.getImageData(0, 0, width, height)
      const output = originalData.data
      const blurred = blurredData.data
      const maskAlpha = this.mask.data

      for (let i = 0; i < output.length; i += 4) {
        const alpha = maskAlpha[i + 3] / 255
        if (alpha >= 1) continue
        const bgWeight = 1 - alpha
        output[i] = output[i] * alpha + blurred[i] * bgWeight
        output[i + 1] = output[i + 1] * alpha + blurred[i + 1] * bgWeight
        output[i + 2] = output[i + 2] * alpha + blurred[i + 2] * bgWeight
      }

      this.ctx.putImageData(originalData, 0, 0)

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
