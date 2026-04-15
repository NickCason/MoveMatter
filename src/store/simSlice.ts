import type { SimState, PlotBuffer } from '../types'

const PLOT_WINDOW_MS = 30_000

export interface SimSlice {
  sim: SimState
  plotBuffer: PlotBuffer
  setSim: (sim: SimState) => void
  appendPlot: (timeMs: number, pos: number, vel: number, accel: number) => void
  resetSim: () => void
}

const emptySimState = (): SimState => ({
  particles: new Float32Array(0),
  containerPositionMm: 0,
  containerVelocityMms: 0,
  containerAccelMms2: 0,
})

const emptyPlotBuffer = (): PlotBuffer => ({
  times: [],
  positions: [],
  velocities: [],
  accels: [],
})

export const createSimSlice = (set: any): SimSlice => ({
  sim: emptySimState(),
  plotBuffer: emptyPlotBuffer(),
  setSim: (sim) => set({ sim }),
  appendPlot: (timeMs, pos, vel, accel) =>
    set((s: any) => {
      const cutoff = timeMs - PLOT_WINDOW_MS
      const buf = s.plotBuffer
      let start = 0
      while (start < buf.times.length && buf.times[start] < cutoff) start++
      return {
        plotBuffer: {
          times: [...buf.times.slice(start), timeMs],
          positions: [...buf.positions.slice(start), pos],
          velocities: [...buf.velocities.slice(start), vel],
          accels: [...buf.accels.slice(start), accel],
        },
      }
    }),
  resetSim: () => set({ sim: emptySimState(), plotBuffer: emptyPlotBuffer() }),
})
