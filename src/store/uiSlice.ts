import type { UIState, Theme } from '../types'

export interface UISlice {
  ui: UIState
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
  togglePresentationMode: () => void
  setActiveStepId: (id: string | null) => void
}

const defaultUI = (): UIState => ({
  theme: (localStorage.getItem('movematter-theme') as Theme) ?? 'light',
  presentationMode: false,
  activeStepId: null,
})

export const createUISlice = (set: any): UISlice => ({
  ui: defaultUI(),
  setTheme: (theme) => {
    localStorage.setItem('movematter-theme', theme)
    document.documentElement.setAttribute('data-theme', theme)
    set((s: any) => ({ ui: { ...s.ui, theme } }))
  },
  toggleTheme: () =>
    set((s: any) => {
      const next: Theme = s.ui.theme === 'light' ? 'dark' : 'light'
      localStorage.setItem('movematter-theme', next)
      document.documentElement.setAttribute('data-theme', next)
      return { ui: { ...s.ui, theme: next } }
    }),
  togglePresentationMode: () =>
    set((s: any) => ({
      ui: { ...s.ui, presentationMode: !s.ui.presentationMode },
    })),
  setActiveStepId: (id) =>
    set((s: any) => ({ ui: { ...s.ui, activeStepId: id } })),
})
