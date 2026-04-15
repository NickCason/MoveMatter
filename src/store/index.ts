import { create } from 'zustand'
import type { ContainerConfig, MaterialConfig } from '../types'
import { createProgramSlice, type ProgramSlice } from './programSlice'
import { createPlaybackSlice, type PlaybackSlice } from './playbackSlice'
import { createSimSlice, type SimSlice } from './simSlice'
import { createUISlice, type UISlice } from './uiSlice'
import { MATERIAL_PRESETS } from '../sim/materialPresets'

const DEFAULT_CONTAINER: ContainerConfig = {
  widthMm: 200,
  heightMm: 100,
  fillPercent: 60,
  wallThicknessMm: 5,
}

const DEFAULT_MATERIAL: MaterialConfig = {
  preset: 'water',
  params: MATERIAL_PRESETS.water,
}

export type AppStore = ProgramSlice &
  PlaybackSlice &
  SimSlice &
  UISlice & {
    container: ContainerConfig
    material: MaterialConfig
    setContainer: (patch: Partial<ContainerConfig>) => void
    setMaterial: (config: MaterialConfig) => void
  }

export const useStore = create<AppStore>((set) => ({
  ...createProgramSlice(set),
  ...createPlaybackSlice(set),
  ...createSimSlice(set),
  ...createUISlice(set),
  container: DEFAULT_CONTAINER,
  material: DEFAULT_MATERIAL,
  setContainer: (patch) =>
    set((s) => ({ container: { ...s.container, ...patch } })),
  setMaterial: (config) => set({ material: config }),
}))
