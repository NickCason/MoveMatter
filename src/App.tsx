import { useEffect } from 'react'
import { AppShell } from './components/AppShell'
import { useStore } from './store'

export default function App() {
  const theme = useStore((s) => s.ui.theme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  return <AppShell />
}
