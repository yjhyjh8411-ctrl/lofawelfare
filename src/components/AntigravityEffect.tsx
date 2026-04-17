'use client'

import { useEffect, useRef } from 'react'
import Matter from 'matter-js'

const AntigravityEffect = () => {
  const engineRef = useRef<Matter.Engine | null>(null)
  const runnerRef = useRef<Matter.Runner | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const container = document.body

    // --- Matter.js setup ---
    const Engine = Matter.Engine,
      World = Matter.World,
      Runner = Matter.Runner,
      Bodies = Matter.Bodies,
      Mouse = Matter.Mouse,
      MouseConstraint = Matter.MouseConstraint

    const engine = Engine.create({ gravity: { x: 0, y: 1 } })
    const world = engine.world
    engineRef.current = engine

    // --- Create boundaries ---
    const wallOptions = { isStatic: true, render: { visible: false } }
    World.add(world, [
      Bodies.rectangle(container.clientWidth / 2, container.clientHeight + 30, container.clientWidth + 20, 60, wallOptions), // Ground
      Bodies.rectangle(container.clientWidth / 2, -30, container.clientWidth + 20, 60, wallOptions), // Ceiling
      Bodies.rectangle(-30, container.clientHeight / 2, 60, container.clientHeight, wallOptions), // Left wall
      Bodies.rectangle(container.clientWidth + 30, container.clientHeight / 2, 60, container.clientHeight, wallOptions), // Right wall
    ])

    // --- Select DOM elements ---
    const elementsToAnimate = Array.from(
      document.querySelectorAll('body [data-antigravity-body]')
    ) as HTMLElement[]

    const bodies = new Map<HTMLElement, Matter.Body>()
    const originalStyles = new Map<HTMLElement, { transform: string; position: string; top: string; left: string; }>()

    elementsToAnimate.forEach(el => {
      originalStyles.set(el, {
        transform: el.style.transform,
        position: el.style.position,
        top: el.style.top,
        left: el.style.left
      })

      const { x, y, width, height } = el.getBoundingClientRect()
      el.style.position = 'fixed'
      el.style.top = `${y}px`
      el.style.left = `${x}px`

      const body = Bodies.rectangle(x + width / 2, y + height / 2, width, height, {
        restitution: 0.6,
        friction: 0.3,
        density: 0.1
      })
      bodies.set(el, body)
    })

    World.add(world, Array.from(bodies.values()))

    // --- Mouse control ---
    const mouse = Mouse.create(document.body)
    const mouseConstraint = MouseConstraint.create(engine, {
      mouse: mouse,
      constraint: { stiffness: 0.2, render: { visible: false } },
    })
    World.add(world, mouseConstraint)

    // --- Sync DOM with physics ---
    const runner = Runner.create()
    runnerRef.current = runner

    const update = () => {
      if (runner.enabled) {
        bodies.forEach((body, element) => {
          const { x, y } = body.position
          const angle = body.angle
          const bounds = element.getBoundingClientRect()

          element.style.transform = `translate(${x - bounds.width / 2 - parseFloat(element.style.left)}px, ${y - bounds.height / 2 - parseFloat(element.style.top)}px) rotate(${angle}rad)`
        })
        requestAnimationFrame(update)
      }
    }

    Runner.run(runner, engine)
    update()

    // --- Cleanup ---
    return () => {
      if (runnerRef.current) Runner.stop(runnerRef.current)
      if (engineRef.current) {
        World.clear(engineRef.current.world, false)
        Engine.clear(engineRef.current)
      }

      // Restore original styles
      originalStyles.forEach((style, element) => {
        element.style.transform = style.transform
        element.style.position = style.position
        element.style.top = style.top
        element.style.left = style.left
      })
    }
  }, [])

  return null
}

export default AntigravityEffect
