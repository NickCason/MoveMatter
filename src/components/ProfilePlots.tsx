import {
  LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine,
  ResponsiveContainer,
} from 'recharts'
import { useStore } from '../store'

interface PlotProps {
  data: { t: number; v: number }[]
  dataKey: string
  color: string
  unit: string
  currentTimeMs: number
  isPlaying: boolean
}

function MiniPlot({ data, dataKey, color, unit, currentTimeMs, isPlaying }: PlotProps) {
  return (
    <ResponsiveContainer width="100%" height={90}>
      <LineChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
        <XAxis dataKey="t" hide />
        <YAxis
          tickCount={3}
          tick={{ fontSize: 9, fill: 'var(--color-text-muted)' }}
          width={36}
          unit={unit}
        />
        <Tooltip
          cursor={!isPlaying}
          contentStyle={{
            fontSize: 10, padding: '2px 6px',
            background: 'var(--color-surface)', border: '1px solid var(--color-border)',
          }}
          formatter={(v: unknown) => [`${(v as number).toFixed(1)} ${unit}`, dataKey] as [string, string]}
        />
        <ReferenceLine x={currentTimeMs} stroke="var(--color-accent)" strokeWidth={1.5} />
        <Line
          type="monotone"
          dataKey="v"
          stroke={color}
          dot={false}
          strokeWidth={1.5}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

export function ProfilePlots() {
  const staticPlot = useStore((s) => s.staticPlot)
  const currentTimeMs = useStore((s) => s.playback.currentTimeMs)
  const isPlaying = useStore((s) => s.playback.status === 'playing')

  if (!staticPlot) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100%', color: 'var(--color-text-muted)', fontSize: 11,
      }}>
        Run a program to see the motion profile.
      </div>
    )
  }

  const posData = staticPlot.times.map((t, i) => ({ t, v: staticPlot.positions[i] }))
  const velData = staticPlot.times.map((t, i) => ({ t, v: staticPlot.velocities[i] }))
  const accelData = staticPlot.times.map((t, i) => ({ t, v: staticPlot.accels[i] }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '4px 8px', gap: 2 }}>
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: 9, color: 'var(--color-text-muted)', margin: '0 0 1px 36px', fontWeight: 600 }}>
          POSITION (mm)
        </p>
        <MiniPlot data={posData} dataKey="pos" color="#3b82f6" unit="mm"
          currentTimeMs={currentTimeMs} isPlaying={isPlaying} />
      </div>
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: 9, color: 'var(--color-text-muted)', margin: '0 0 1px 36px', fontWeight: 600 }}>
          VELOCITY (mm/s)
        </p>
        <MiniPlot data={velData} dataKey="vel" color="#10b981" unit="mm/s"
          currentTimeMs={currentTimeMs} isPlaying={isPlaying} />
      </div>
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: 9, color: 'var(--color-text-muted)', margin: '0 0 1px 36px', fontWeight: 600 }}>
          ACCEL (mm/s²)
        </p>
        <MiniPlot data={accelData} dataKey="accel" color="#f59e0b" unit="mm/s²"
          currentTimeMs={currentTimeMs} isPlaying={isPlaying} />
      </div>
    </div>
  )
}
