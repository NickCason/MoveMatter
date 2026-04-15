import { useStore } from '../store'
import { Header } from './Header'
import { SimViewport } from './SimViewport'
import { ProgramEditorPanel } from './ProgramEditorPanel'
import { ProfilePlots } from './ProfilePlots'
import { PlaybackBar } from './PlaybackBar'

export function AppShell() {
  const presentationMode = useStore((s) => s.ui.presentationMode)

  if (presentationMode) {
    return (
      <div
        className="flex flex-col h-screen overflow-hidden"
        style={{ background: 'var(--color-bg)' }}
      >
        <Header />
        <div className="flex-1 flex flex-col overflow-hidden" style={{ minHeight: 0 }}>
          <div style={{ flex: 3, minHeight: 0 }}>
            <SimViewport />
          </div>
          <div
            style={{
              flex: 2, minHeight: 0,
              borderTop: '1px solid var(--color-border)',
              background: 'var(--color-surface)',
            }}
          >
            <ProfilePlots />
          </div>
        </div>
        <div style={{ height: 56 }}>
          <PlaybackBar />
        </div>
      </div>
    )
  }

  return (
    <div
      className="flex flex-col h-screen overflow-hidden"
      style={{ background: 'var(--color-bg)' }}
    >
      <Header />
      <div className="flex flex-1 overflow-hidden" style={{ minHeight: 0 }}>
        {/* Left sidebar: Program Editor */}
        <aside
          style={{
            width: 320,
            borderRight: '1px solid var(--color-border)',
            background: 'var(--color-surface)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div style={{ flex: 1, overflowY: 'auto', padding: 10 }}>
            <ProgramEditorPanel />
          </div>
        </aside>

        {/* Right pane: Viewport + Plots + Playback */}
        <div className="flex flex-1 flex-col overflow-hidden" style={{ minHeight: 0 }}>
          <div style={{ flex: 3, minHeight: 0 }}>
            <SimViewport />
          </div>
          <div
            style={{
              flex: 2, minHeight: 0,
              borderTop: '1px solid var(--color-border)',
              background: 'var(--color-surface)',
            }}
          >
            <ProfilePlots />
          </div>
          <div style={{ height: 56, flexShrink: 0 }}>
            <PlaybackBar />
          </div>
        </div>
      </div>
    </div>
  )
}
