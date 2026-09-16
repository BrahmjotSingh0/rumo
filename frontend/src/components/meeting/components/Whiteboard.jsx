import { useEffect, useRef, useState } from 'react'
import { X, Trash2, Eraser } from 'lucide-react'

const COLORS = ['#ffffff', '#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7']

// A shared drawing surface. Coordinates are sent over the wire as fractions
// of the canvas (0-1), not pixels, so this looks right regardless of each
// participant's window size - see socketService.js's handleWhiteboardDraw.
const Whiteboard = ({ isOpen, onClose, socket, roomId, canClear }) => {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const drawingRef = useRef(false)
  const lastPointRef = useRef(null)
  const strokesRef = useRef([]) // everything drawn this session, for redraw on resize
  const [color, setColor] = useState('#ffffff')
  const [brushWidth, setBrushWidth] = useState(3)
  const [isEraser, setIsEraser] = useState(false)

  const drawSegment = (stroke) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.strokeStyle = stroke.color
    ctx.lineWidth = stroke.width
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(stroke.x0 * canvas.width, stroke.y0 * canvas.height)
    ctx.lineTo(stroke.x1 * canvas.width, stroke.y1 * canvas.height)
    ctx.stroke()
  }

  const redrawAll = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    strokesRef.current.forEach(drawSegment)
  }

  // Size the canvas to its container in real pixels (not just CSS size),
  // and redraw everything so existing strokes still line up after a resize.
  useEffect(() => {
    if (!isOpen) return

    const resize = () => {
      const canvas = canvasRef.current
      const container = containerRef.current
      if (!canvas || !container) return
      canvas.width = container.clientWidth
      canvas.height = container.clientHeight
      redrawAll()
    }

    resize()
    const observer = new ResizeObserver(resize)
    if (containerRef.current) observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [isOpen])

  useEffect(() => {
    if (!socket) return

    const handleRemoteDraw = (stroke) => {
      strokesRef.current.push(stroke)
      drawSegment(stroke)
    }
    const handleState = (strokes) => {
      strokesRef.current = strokes
      redrawAll()
    }
    const handleCleared = () => {
      strokesRef.current = []
      redrawAll()
    }

    socket.on('whiteboard-draw', handleRemoteDraw)
    socket.on('whiteboard-state', handleState)
    socket.on('whiteboard-cleared', handleCleared)

    return () => {
      socket.off('whiteboard-draw', handleRemoteDraw)
      socket.off('whiteboard-state', handleState)
      socket.off('whiteboard-cleared', handleCleared)
    }
  }, [socket])

  if (!isOpen) return null

  const getRelativePoint = (event) => {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    return {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height
    }
  }

  const handlePointerDown = (event) => {
    drawingRef.current = true
    lastPointRef.current = getRelativePoint(event)
  }

  const handlePointerMove = (event) => {
    if (!drawingRef.current || !lastPointRef.current) return
    const point = getRelativePoint(event)
    const stroke = {
      x0: lastPointRef.current.x, y0: lastPointRef.current.y,
      x1: point.x, y1: point.y,
      color: isEraser ? '#1f2937' : color,
      width: isEraser ? 24 : brushWidth
    }
    strokesRef.current.push(stroke)
    drawSegment(stroke)
    socket?.emit('whiteboard-draw', { roomId, ...stroke })
    lastPointRef.current = point
  }

  const handlePointerUp = () => {
    drawingRef.current = false
    lastPointRef.current = null
  }

  const clearBoard = () => {
    socket?.emit('whiteboard-clear', { roomId })
  }

  return (
    <div className="fixed inset-0 z-[200] bg-gray-900/95 backdrop-blur-sm flex flex-col">
      <div className="flex items-center justify-between gap-3 p-3 sm:p-4 border-b border-gray-700 bg-gray-800/80">
        <div className="flex items-center gap-2 flex-wrap">
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => { setColor(c); setIsEraser(false) }}
              className={`w-7 h-7 rounded-full border-2 transition-transform ${color === c && !isEraser ? 'border-white scale-110' : 'border-gray-600'}`}
              style={{ backgroundColor: c }}
              title={c}
            />
          ))}
          <input
            type="range"
            min="1"
            max="20"
            value={brushWidth}
            onChange={(e) => setBrushWidth(Number(e.target.value))}
            className="w-20 sm:w-28 mx-1"
            title="Brush size"
          />
          <button
            onClick={() => setIsEraser(v => !v)}
            className={`p-2 rounded-lg transition-colors ${isEraser ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
            title="Eraser"
          >
            <Eraser size={16} />
          </button>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {canClear && (
            <button
              onClick={clearBoard}
              className="p-2 rounded-lg bg-gray-700 text-gray-300 hover:bg-red-600 hover:text-white transition-colors"
              title="Clear whiteboard"
            >
              <Trash2 size={16} />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors"
            title="Close whiteboard"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <div ref={containerRef} className="flex-1 relative touch-none">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full cursor-crosshair"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />
      </div>
    </div>
  )
}

export default Whiteboard
