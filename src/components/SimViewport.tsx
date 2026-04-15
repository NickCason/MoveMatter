import { useEffect, useRef } from 'react'
import { Application, Graphics, BlurFilter, ColorMatrixFilter } from 'pixi.js'
import { useStore } from '../store'
import { particleStateRef } from '../sim/simLoop'
import { drawTrack, drawContainer, drawParticles, mmToPxScale } from '../sim/renderer'

export function SimViewport() {
  const mountRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<Application | null>(null)

  const theme = useStore((s) => s.ui.theme)

  useEffect(() => {
    if (!mountRef.current) return
    let mounted = true
    let app: Application | null = null
    let blurFilter: BlurFilter | null = null
    let thresholdFilter: ColorMatrixFilter | null = null

    async function init() {
      const state = useStore.getState()
      app = new Application()
      await app.init({
        resizeTo: mountRef.current!,
        background: state.ui.theme === 'dark' ? 0x0f172a : 0xf8fafc,
        antialias: true,
        resolution: window.devicePixelRatio,
        autoDensity: true,
      })
      if (!mounted) {
        // App fully initialized — safe to destroy
        try { app.destroy(true) } catch { /* ignore */ }
        return
      }

      mountRef.current!.appendChild(app.canvas)

      const trackG = new Graphics()
      const containerG = new Graphics()
      const particleG = new Graphics()
      app.stage.addChild(trackG, containerG, particleG)

      // Metaball filter for liquid modes (applied to particleG)
      blurFilter = new BlurFilter({ strength: 8, quality: 2 })
      thresholdFilter = new ColorMatrixFilter()
      // Alpha: threshold at ~0.45 — values below go transparent, above stay solid
      thresholdFilter.matrix = [
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

        const state = useStore.getState()
        const axisLength = state.program.axisLength
        const scale = mmToPxScale(width, axisLength)
        const trackY = height * 0.45
        const isDark = state.ui.theme === 'dark'
        const trackColor = isDark ? 0x475569 : 0xcbd5e1

        drawTrack(trackG, axisLength, scale, trackY, trackColor)
        drawContainer(containerG, containerPositionMm, container, scale, trackY, isDark)

        // Toggle metaball filter based on material
        const isLiquid = material.preset === 'water' || material.preset === 'oil'
        if (material.preset !== prevMaterialPreset) {
          particleG.filters = isLiquid ? [blurFilter, thresholdFilter] : []
          prevMaterialPreset = material.preset
        }

        drawParticles(particleG, particles, containerPositionMm, container, material, scale, trackY)
      })

      appRef.current = app
    }

    init()

    return () => {
      mounted = false
      // Only destroy if app was fully initialized (appRef set); partial init
      // (async init still in-flight) will be cleaned up inside init() itself
      if (appRef.current) {
        try { blurFilter?.destroy() } catch { /* ignore */ }
        try { thresholdFilter?.destroy() } catch { /* ignore */ }
        try { appRef.current.destroy(true) } catch { /* ignore */ }
        appRef.current = null
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps — intentional: init once

  useEffect(() => {
    const app = appRef.current
    if (!app) return
    app.renderer.background.color = theme === 'dark' ? 0x0f172a : 0xf8fafc
  }, [theme])

  return (
    <div
      ref={mountRef}
      className="w-full h-full"
      style={{ background: theme === 'dark' ? '#0f172a' : '#f8fafc' }}
    />
  )
}
