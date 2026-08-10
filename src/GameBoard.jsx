import { useRef, useEffect, useCallback, useState } from 'react'
import './index.css'

// ─── Drawing helpers ──────────────────────────────────────────────────────────

function drawX(ctx, cx, cy, cell, t, win) {
  const half = cell / 2 - 20
  const r = half * 0.8
  const glow = win ? 40 : 20
  const lw = win ? 10 : 8

  ctx.save()
  ctx.shadowColor = '#ff2d78'
  ctx.shadowBlur = glow
  ctx.strokeStyle = '#ff2d78'
  ctx.lineWidth = lw
  ctx.lineCap = 'round'
  ctx.globalAlpha = 0.6 + Math.sin(t * 3) * 0.1
  ctx.beginPath()
  ctx.moveTo(cx - r, cy - r); ctx.lineTo(cx + r, cy + r)
  ctx.moveTo(cx + r, cy - r); ctx.lineTo(cx - r, cy + r)
  ctx.stroke()
  ctx.restore()

  ctx.save()
  ctx.strokeStyle = '#ffd0e8'
  ctx.lineWidth = win ? 4 : 3
  ctx.lineCap = 'round'
  ctx.globalAlpha = 0.92
  ctx.beginPath()
  ctx.moveTo(cx - r, cy - r); ctx.lineTo(cx + r, cy + r)
  ctx.moveTo(cx + r, cy - r); ctx.lineTo(cx - r, cy + r)
  ctx.stroke()
  ctx.restore()
}

function drawO(ctx, cx, cy, cell, t, win) {
  const r = cell / 2 - 24
  const glow = win ? 40 : 20
  const lw = win ? 10 : 8

  ctx.save()
  ctx.shadowColor = '#00f5d4'
  ctx.shadowBlur = glow
  ctx.strokeStyle = '#00f5d4'
  ctx.lineWidth = lw
  ctx.globalAlpha = 0.6 + Math.sin(t * 3) * 0.1
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()

  ctx.save()
  ctx.strokeStyle = '#aafff0'
  ctx.lineWidth = win ? 4 : 3
  ctx.globalAlpha = 0.92
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

function drawWinLine(ctx, cells, board, cell, t) {
  const color = board[cells[0]] === 'X' ? '#ff2d78' : '#00f5d4'
  const pts = cells.map(c => ({
    x: (c % 3) * cell + cell / 2,
    y: Math.floor(c / 3) * cell + cell / 2,
  }))
  const alpha = 0.5 + Math.sin(t * 6) * 0.3

  ctx.save()
  ctx.shadowColor = color
  ctx.shadowBlur = 30
  ctx.strokeStyle = color
  ctx.lineWidth = 8
  ctx.lineCap = 'round'
  ctx.globalAlpha = alpha
  ctx.beginPath()
  ctx.moveTo(pts[0].x, pts[0].y)
  ctx.lineTo(pts[2].x, pts[2].y)
  ctx.stroke()
  ctx.restore()

  ctx.save()
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  ctx.globalAlpha = alpha * 0.4
  ctx.beginPath()
  ctx.moveTo(pts[0].x, pts[0].y)
  ctx.lineTo(pts[2].x, pts[2].y)
  ctx.stroke()
  ctx.restore()
}

// ─── Main draw ────────────────────────────────────────────────────────────────
function drawBoard(ctx, size, board, hovered, winLine, t) {
  const cell = size / 3

  // Background fills entire canvas
  const bg = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size * 0.8)
  bg.addColorStop(0, '#1e0e38')
  bg.addColorStop(1, '#080412')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, size, size)

  // Subtle inner glow border at edge
  ctx.save()
  ctx.strokeStyle = 'rgba(155,93,229,0.2)'
  ctx.lineWidth = 2
  ctx.shadowColor = '#9b5de5'
  ctx.shadowBlur = 20
  ctx.beginPath()
  ctx.roundRect(2, 2, size - 4, size - 4, 16)
  ctx.stroke()
  ctx.restore()

  // Board surface (slightly lighter than background)
  const boardBg = ctx.createLinearGradient(0, 0, size, size)
  boardBg.addColorStop(0, '#1a1040')
  boardBg.addColorStop(1, '#0e0820')
  ctx.fillStyle = boardBg
  ctx.beginPath()
  ctx.roundRect(0, 0, size, size, 16)
  ctx.fill()

  const pulse = 0.5 + Math.sin(t * 1.5) * 0.07

  // Cells
  for (let i = 0; i < 9; i++) {
    const col = i % 3
    const row = Math.floor(i / 3)
    const x = col * cell
    const y = row * cell
    const cx = x + cell / 2
    const cy = y + cell / 2
    const isWin = winLine?.includes(i)

    if (isWin) {
      const a = 0.15 + Math.sin(t * 4) * 0.05
      ctx.save()
      ctx.fillStyle = `rgba(155,93,229,${a})`
      ctx.shadowColor = '#9b5de5'
      ctx.shadowBlur = 22
      ctx.beginPath()
      ctx.roundRect(x + 5, y + 5, cell - 10, cell - 10, 12)
      ctx.fill()
      ctx.restore()
    } else if (hovered === i) {
      ctx.save()
      ctx.fillStyle = 'rgba(155,93,229,0.09)'
      ctx.beginPath()
      ctx.roundRect(x + 5, y + 5, cell - 10, cell - 10, 12)
      ctx.fill()
      ctx.restore()
    }

    if (board[i] === 'X') drawX(ctx, cx, cy, cell, t, isWin)
    else if (board[i] === 'O') drawO(ctx, cx, cy, cell, t, isWin)
  }

  // Grid — full edge to edge
  ctx.save()
  ctx.strokeStyle = '#9b5de5'
  ctx.lineWidth = 3
  ctx.lineCap = 'round'
  ctx.shadowColor = '#9b5de5'
  ctx.shadowBlur = 12
  ctx.globalAlpha = pulse

  for (let i = 1; i < 3; i++) {
    const x = i * cell
    ctx.beginPath(); ctx.moveTo(x, 2); ctx.lineTo(x, size - 2); ctx.stroke()
    const y = i * cell
    ctx.beginPath(); ctx.moveTo(2, y); ctx.lineTo(size - 2, y); ctx.stroke()
  }
  ctx.restore()

  // Win line
  if (winLine) drawWinLine(ctx, winLine, board, cell, t)
}

// ─── Component ────────────────────────────────────────────────────────────────
export function GameBoard({ board, onCellClick, disabled, winLine }) {
  const canvasRef = useRef(null)
  const wrapperRef = useRef(null)
  const [size, setSize] = useState(420)
  const [hovered, setHovered] = useState(-1)
  const animRef = useRef()
  const sizeRef = useRef(420)

  // Observe wrapper size
  useEffect(() => {
    if (!wrapperRef.current) return
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const s = Math.min(entry.contentRect.width, entry.contentRect.height)
        if (s > 10) {
          sizeRef.current = Math.floor(s)
          setSize(Math.floor(s))
        }
      }
    })
    ro.observe(wrapperRef.current)
    return () => ro.disconnect()
  }, [])

  // Animation loop
  useEffect(() => {
    const loop = (ts) => {
      const canvas = canvasRef.current
      if (canvas) {
        const s = sizeRef.current
        canvas.width = s
        canvas.height = s
        const ctx = canvas.getContext('2d')
        ctx.clearRect(0, 0, s, s)
        drawBoard(ctx, s, board, hovered, winLine, ts / 1000)
      }
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(animRef.current)
  }, [board, hovered, winLine])

  const getCellIndex = useCallback((e) => {
    const canvas = canvasRef.current
    if (!canvas) return -1
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    // Scale from CSS pixels to canvas pixels
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const cx = x * scaleX
    const cy = y * scaleY
    const cell = sizeRef.current / 3
    const col = Math.floor(cx / cell)
    const row = Math.floor(cy / cell)
    if (col < 0 || col > 2 || row < 0 || row > 2) return -1
    return row * 3 + col
  }, [])

  const handleClick = useCallback((e) => {
    const i = getCellIndex(e)
    if (i !== -1 && !disabled) onCellClick(i)
  }, [getCellIndex, onCellClick, disabled])

  return (
    <div
      ref={wrapperRef}
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 16px 16px',
      }}
    >
      <div
        style={{
          width: size,
          height: size,
          borderRadius: 20,
          overflow: 'hidden',
          boxShadow: '0 0 0 1px rgba(155,93,229,0.3), 0 8px 40px rgba(0,0,0,0.5)',
          flexShrink: 0,
        }}
      >
        <canvas
          ref={canvasRef}
          width={size}
          height={size}
          style={{
            display: 'block',
            width: size,
            height: size,
            cursor: disabled ? 'default' : 'pointer',
          }}
          onClick={handleClick}
          onMouseMove={(e) => setHovered(getCellIndex(e))}
          onMouseLeave={() => setHovered(-1)}
        />
      </div>
    </div>
  )
}
