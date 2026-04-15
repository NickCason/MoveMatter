import { useStore } from '../store'

export function Header() {
  const toggleTheme = useStore((s) => s.toggleTheme)
  const theme = useStore((s) => s.ui.theme)
  const togglePresentation = useStore((s) => s.togglePresentationMode)
  const presentationMode = useStore((s) => s.ui.presentationMode)

  return (
    <header
      style={{ borderBottom: '1px solid var(--color-border)' }}
      className="h-12 flex items-center px-4 gap-4 shrink-0"
    >
      <span className="font-bold text-base tracking-tight" style={{ color: 'var(--color-text)' }}>
        MoveMatter
      </span>

      {/* File menu stub — replaced in Phase 2 */}
      <nav className="flex gap-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>
        <button className="hover:opacity-80">New</button>
        <button className="hover:opacity-80">Open</button>
        <button className="hover:opacity-80">Save</button>
      </nav>

      <div className="ml-auto flex items-center gap-3 text-sm">
        <button
          onClick={togglePresentation}
          style={{ color: 'var(--color-text-muted)' }}
          className="hover:opacity-80"
        >
          {presentationMode ? 'Exit Presentation' : 'Presentation'}
        </button>
        <button
          onClick={toggleTheme}
          style={{ color: 'var(--color-accent)' }}
          className="hover:opacity-80 font-medium"
          aria-label="Toggle theme"
        >
          {theme === 'light' ? '☾ Dark' : '☀ Light'}
        </button>
      </div>
    </header>
  )
}
