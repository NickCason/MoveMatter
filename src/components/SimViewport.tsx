import { useEffect, useRef } from 'react'
import { Application, Graphics, BlurFilter, ColorMatrixFilter } from 'pixi.js'
import { useStore } from '../store'
import { particleStateRef } from '../sim/simLoop'
import { drawTrack, drawContainer, drawParticles, mmToPxScale } from '../sim/renderer'

export function SimViewport() {
  const mountRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<Application | null>(null)

  const program = useStore((s) => s.program)
  const ui = useStore((s) => s.ui)

  useEffect(() => {
    if (!mountRef.current) return
    let mounted = true
    let app: Application | null = null

    async function init() {
      app = new Application()
      await app.init({
        resizeTo: mountRef.current!,
        background: ui.theme === 'dark' ? 0x0f172a : 0xf8fafc,
        antialias: true,
        resolution: window.devicePixelRatio,
        autoDensity: true,
      })
      if (!mounted) { app.destroy(true); return }

      mountRef.current!.appendChild(app.canvas)

      const trackG = new Graphics()
      const containerG = new Graphics()
      const particleG = new Graphics()
      app.stage.addChild(trackG, containerG, particleG)

      // Metaball filter for liquid modes (applied to particleG)
      const blur = new BlurFilter({ strength: 8, quality: 2 })
      const threshold = new ColorMatrixFilter()
      // Alpha: threshold at ~0.45 — values below go transparent, above stay solid
      threshold.matrix = [
        1, 0, 0, 0, 0,
        0, 1, 0, 0, 0,
        0, 0, 1, 0, 0,
        0, 0, 0, 18, -7,
      ]

      let prevMaterialPreset: string | null = null

      app.ticker.add(() => {
        if (!app) return
        const { width, height } = app.screen
        const { containerPositionMm, particles, material, container } = particleStateRef

        if (!container || !material) return

        const axisLength = program.axisLength
        const scale = mmToPxScale(width, axisLength)
        const trackY = height * 0.45
        const isDark = ui.theme === 'dark'
        const trackColor = isDark ? 0x475569 : 0xcbd5e1

        drawTrack(trackG, axisLength, scale, trackY, trackColor)
        drawContainer(containerG, containerPositionMm, container, scale, trackY, isDark)

        // Toggle metaball filter based on material
        const isLiquid = material.preset === 'water' || material.preset === 'oil'
        if (material.preset !== prevMaterialPreset) {
          particleG.filters = isLiquid ? [blur, threshold] : []
          prevMaterialPreset = material.preset
        }

        drawParticles(particleG, particles, containerPositionMm, container, material, scale, trackY)
      })

      appRef.current = app
    }

    init()

    return () => {
      mounted = false
      app?.destroy(true)
      appRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps — intentional: init once

  return (
    <div
      ref={mountRef}
      className="w-full h-full"
      style={{ background: ui.theme === 'dark' ? '#0f172a' : '#f8fafc' }}
    />
  )
}
