import type { SimState, StaticPlot, ContainerConfig, PBDParams } from '../types'
import { initParticles } from '../sim/pbdSolver'

export interface SimSlice {
  sim: SimState
  staticPlot: StaticPlot | null
  setSim: (sim: SimState) => void
  setStaticPlot: (plot: StaticPlot) => void
  clearStaticPlot: () => void
  resetSim: () => void
  reinitParticles: (container: ContainerConfig, params: PBDParams) => void
}

const emptySimState = (): SimState => ({
  particles: new Float32Array(0),
  containerPositionMm: 0,
  containerVelocityMms: 0,
  containerAccelMms2: 0,
})

export const createSimSlice = (set: any): SimSlice => ({
  sim: emptySimState(),
  staticPlot: null,
  setSim: (sim) => set({ sim }),
  setStaticPlot: (plot) => set({ staticPlot: plot }),
  clearStaticPlot: () => set({ staticPlot: null }),
  resetSim: () => set({ sim: emptySimState(), staticPlot: null }),
  reinitParticles: (container, params) =>
    set({ sim: { ...emptySimState(), particles: initParticles(container, params) } }),
})
