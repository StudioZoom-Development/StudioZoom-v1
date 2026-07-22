'use client'
import React, { useEffect, useState, useRef } from 'react'

// ─── CANVAS FALLBACK BEAMS ──────────────────────────────────────────────────
// Rendered while the large 9MB JS bundle is loading or if it fails
function CanvasFallbackBeams() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animationFrameId: number
    let width = (canvas.width = window.innerWidth)
    let height = (canvas.height = window.innerHeight)

    const handleResize = () => {
      if (!canvas) return
      width = canvas.width = window.innerWidth
      height = canvas.height = window.innerHeight
    }
    window.addEventListener('resize', handleResize)

    class Beam {
      x!: number
      y!: number
      speed!: number
      length!: number
      opacity!: number
      angle!: number
      color!: string

      constructor() {
        this.reset()
        this.y = Math.random() * height
      }

      reset() {
        const spawnFromLeft = Math.random() > 0.5
        if (spawnFromLeft) {
          this.x = -100
          this.y = Math.random() * height
        } else {
          this.x = Math.random() * width
          this.y = -100
        }
        
        this.speed = 1.5 + Math.random() * 2.5
        this.length = 150 + Math.random() * 250
        this.opacity = 0.15 + Math.random() * 0.35
        this.angle = Math.PI / 4
        this.color = '#c6539f'
      }

      update() {
        this.x += this.speed * Math.cos(this.angle)
        this.y += this.speed * Math.sin(this.angle)

        if (this.x > width + 200 || this.y > height + 200) {
          this.reset()
        }
      }

      draw(c: CanvasRenderingContext2D) {
        c.save()
        const grad = c.createLinearGradient(
          this.x - this.length * Math.cos(this.angle),
          this.y - this.length * Math.sin(this.angle),
          this.x,
          this.y
        )
        grad.addColorStop(0, 'rgba(198, 83, 159, 0)')
        grad.addColorStop(0.8, `rgba(198, 83, 159, ${this.opacity})`)
        grad.addColorStop(1, '#ffffff')

        c.strokeStyle = grad
        c.lineWidth = 1.5
        c.lineCap = 'round'
        c.beginPath()
        c.moveTo(
          this.x - this.length * Math.cos(this.angle),
          this.y - this.length * Math.sin(this.angle)
        )
        c.lineTo(this.x, this.y)
        c.stroke()
        c.restore()
      }
    }

    const beams: Beam[] = []
    const beamCount = 6
    for (let i = 0; i < beamCount; i++) {
      beams.push(new Beam())
    }

    const drawGrid = (c: CanvasRenderingContext2D) => {
      c.strokeStyle = 'rgba(255, 255, 255, 0.02)'
      c.lineWidth = 0.5
      const gridSize = 60

      for (let x = 0; x < width; x += gridSize) {
        c.beginPath()
        c.moveTo(x, 0)
        c.lineTo(x, height)
        c.stroke()
      }
      for (let y = 0; y < height; y += gridSize) {
        c.beginPath()
        c.moveTo(0, y)
        c.lineTo(width, y)
        c.stroke()
      }
    }

    const render = () => {
      ctx.clearRect(0, 0, width, height)
      drawGrid(ctx)
      beams.forEach(beam => {
        beam.update()
        beam.draw(ctx)
      })
      animationFrameId = requestAnimationFrame(render)
    }

    render()

    return () => {
      cancelAnimationFrame(animationFrameId)
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 0,
        opacity: 0.8,
      }}
    />
  )
}

// ─── CORE WRAPPER ────────────────────────────────────────────────────────────
export function BackgroundBeams() {
  const [DesignSystemComponent, setDesignSystemComponent] = useState<any>(null)

  useEffect(() => {
    let intervalId: any

    const checkBundle = () => {
      const ds = (window as any).MyDesignSystem
      if (ds && ds.AceternityBackgroundBeams) {
        setDesignSystemComponent(() => ds.AceternityBackgroundBeams)
        if (intervalId) clearInterval(intervalId)
      }
    }

    // Direct check
    checkBundle()

    // Polling fallback
    intervalId = setInterval(checkBundle, 100)

    return () => {
      if (intervalId) clearInterval(intervalId)
    }
  }, [])

  if (DesignSystemComponent) {
    // Render the exact component from MyDesignSystem global bundle!
    return React.createElement(DesignSystemComponent)
  }

  // Shimmer fallback during asset load
  return <CanvasFallbackBeams />
}
