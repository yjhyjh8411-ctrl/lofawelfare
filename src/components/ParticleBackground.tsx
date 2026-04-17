'use client'

import { useEffect, useRef } from 'react'

export default function ParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animationId: number
    const cursor = { x: -100, y: -100 }
    const smooth = { x: -100, y: -100 }

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }

    const onMouseMove = (e: MouseEvent) => {
      cursor.x = e.clientX
      cursor.y = e.clientY
    }
    const onMouseLeave = () => {
      cursor.x = -100
      cursor.y = -100
    }

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // 부드러운 추적
      smooth.x += (cursor.x - smooth.x) * 0.15
      smooth.y += (cursor.y - smooth.y) * 0.15

      if (cursor.x > -50) {
        ctx.beginPath()
        ctx.arc(smooth.x, smooth.y, 9, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(232,146,42,0.8)'
        ctx.fill()
      }

      animationId = requestAnimationFrame(animate)
    }

    resize()
    window.addEventListener('resize', resize)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseleave', onMouseLeave)
    animate()

    return () => {
      cancelAnimationFrame(animationId)
      window.removeEventListener('resize', resize)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseleave', onMouseLeave)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 9999,
      }}
    />
  )
}
