// src/App.tsx
import { useEffect } from 'react'

export default function App() {
  useEffect(() => {
    const saved = localStorage.getItem('movematter-theme') ?? 'light'
    document.documentElement.setAttribute('data-theme', saved)
  }, [])

  return (
    <div className="min-h-screen flex flex-col">
      <header className="h-12 border-b flex items-center px-4 text-sm font-semibold">
        MoveMatter
      </header>
      <main className="flex-1 flex items-center justify-center text-[var(--color-text-muted)]">
        Phase 1 scaffold — UI coming in Phase 2
      </main>
    </div>
  )
}
