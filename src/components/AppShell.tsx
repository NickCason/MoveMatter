import { useStore } from '../store'
import { Header } from './Header'

export function AppShell() {
  const presentationMode = useStore((s) => s.ui.presentationMode)

  if (presentationMode) {
    return (
      <div className="flex flex-col h-screen overflow-hidden" style={{ background: 'var(--color-bg)' }}>
        <Header />
        {/* Presentation layout — Phase 2 fills these */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div
            id="sim-viewport-slot"
            className="flex-[3] flex items-center justify-center text-sm"
            style={{ color: 'var(--color-text-muted)', borderBottom: '1px solid var(--color-border)' }}
          >
            Simulation viewport (Phase 2)
          </div>
          <div
            id="profile-plots-slot"
            className="flex-[2] flex items-center justify-center text-sm"
            style={{ color: 'var(--color-text-muted)', borderBottom: '1px solid var(--color-border)' }}
          >
            Profile plots (Phase 2)
          </div>
          <div
            id="playback-bar-slot"
            className="h-14 flex items-center justify-center text-sm"
            style={{ color: 'var(--color-text-muted)', borderTop: '1px solid var(--color-border)' }}
          >
            Playback bar (Phase 2)
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: 'var(--color-bg)' }}>
      <Header />
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar: Program Editor */}
        <aside
          id="program-editor-slot"
          style={{
            width: 320,
            borderRight: '1px solid var(--color-border)',
            background: 'var(--color-surface)',
          }}
          className="flex flex-col overflow-y-auto shrink-0 p-3 text-sm"
        >
          <p style={{ color: 'var(--color-text-muted)' }}>Program editor panel (Phase 2)</p>
        </aside>

        {/* Right pane: Viewport + Plots + Playback */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <div
            id="sim-viewport-slot"
            className="flex-[3] flex items-center justify-center text-sm"
            style={{ color: 'var(--color-text-muted)', borderBottom: '1px solid var(--color-border)' }}
          >
            Simulation viewport (Phase 2)
          </div>
          <div
            id="profile-plots-slot"
            className="flex-[2] flex items-center justify-center text-sm"
            style={{ color: 'var(--color-text-muted)', borderBottom: '1px solid var(--color-border)' }}
          >
            Profile plots (Phase 2)
          </div>
          <div
            id="playback-bar-slot"
            className="h-14 flex items-center justify-center text-sm"
            style={{ color: 'var(--color-text-muted)', borderTop: '1px solid var(--color-border)' }}
          >
            Playback bar (Phase 2)
          </div>
        </div>
      </div>
    </div>
  )
}
