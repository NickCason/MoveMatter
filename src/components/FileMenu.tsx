import { useRef } from 'react'
import { useStore } from '../store'
import { MATERIAL_PRESETS } from '../sim/materialPresets'
import type { MoveMatterFile } from '../types'
import { defaultProgram } from '../store/programSlice'

export function FileMenu() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const program = useStore((s) => s.program)
  const container = useStore((s) => s.container)
  const material = useStore((s) => s.material)
  const setProgram = useStore((s) => s.setProgram)
  const setContainer = useStore((s) => s.setContainer)
  const setMaterial = useStore((s) => s.setMaterial)

  function buildFile(): MoveMatterFile {
    return { version: 1, program, container, material }
  }

  function downloadJson(data: MoveMatterFile, filename: string) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleNew() {
    if (!confirm('Start a new program? Unsaved changes will be lost.')) return
    setProgram(defaultProgram())
    setContainer({ widthMm: 200, heightMm: 100, fillPercent: 60, wallThicknessMm: 5 })
    setMaterial({ preset: 'water', params: MATERIAL_PRESETS.water })
  }

  function handleOpen() {
    fileInputRef.current?.click()
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string) as MoveMatterFile
        if (data.version !== 1) {
          alert('Unsupported file version')
          return
        }
        setProgram(data.program)
        setContainer(data.container)
        setMaterial(data.material)
      } catch {
        alert('Failed to read file — not a valid .movematter.json')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  function handleSave() {
    const name = program.name.replace(/[^a-z0-9_-]/gi, '_')
    downloadJson(buildFile(), `${name}.movematter.json`)
  }

  function handleSaveAs() {
    const name = prompt('Save as:', program.name)
    if (!name) return
    const updated = { ...program, name }
    setProgram(updated)
    downloadJson(
      { version: 1, program: updated, container, material },
      `${name.replace(/[^a-z0-9_-]/gi, '_')}.movematter.json`
    )
  }

  const btnStyle: React.CSSProperties = {
    background: 'none', border: 'none', cursor: 'pointer', padding: '0 6px',
    fontSize: 13, color: 'var(--color-text-muted)',
  }

  return (
    <nav style={{ display: 'flex', alignItems: 'center' }}>
      <button style={btnStyle} onClick={handleNew}>New</button>
      <button style={btnStyle} onClick={handleOpen}>Open</button>
      <button style={btnStyle} onClick={handleSave}>Save</button>
      <button style={btnStyle} onClick={handleSaveAs}>Save As</button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.movematter.json"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
    </nav>
  )
}
