import { useRef } from 'react'
import type { PointerEvent as ReactPointerEvent, WheelEvent } from 'react'
import type { Parameter } from 'profiles'

const SWEEP = 270
const START_ANGLE = -135
const RADIUS = 26
const C = 2 * Math.PI * RADIUS

function zoneFor(param: Parameter, value: number) {
  return param.zones?.find((z) => value >= z.min && value <= z.max)
}

interface KnobProps {
  param: Parameter
  value: number
  onChange: (value: number) => void
}

export function Knob({ param, value, onChange }: KnobProps) {
  const drag = useRef<{ startY: number; startValue: number } | null>(null)
  const t = (value - param.min) / (param.max - param.min)
  const angle = START_ANGLE + SWEEP * t
  const zone = zoneFor(param, value)

  const setFromPointer = (clientY: number) => {
    const d = drag.current
    if (!d) return
    const sensitivity = (param.max - param.min) / 140
    const delta = Math.round((d.startY - clientY) * sensitivity)
    onChange(Math.min(param.max, Math.max(param.min, d.startValue + delta)))
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    drag.current = { startY: e.clientY, startValue: value }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current) setFromPointer(e.clientY)
  }

  const onPointerUp = () => {
    drag.current = null
  }

  const onWheel = (e: WheelEvent<HTMLDivElement>) => {
    e.preventDefault()
    const step = e.shiftKey ? 1 : 4
    const delta = e.deltaY < 0 ? step : -step
    onChange(Math.min(param.max, Math.max(param.min, value + delta)))
  }

  return (
    <div className="flex w-[72px] select-none flex-col items-center gap-1.5">
      <div
        role="slider"
        aria-label={param.label}
        aria-valuemin={param.min}
        aria-valuemax={param.max}
        aria-valuenow={value}
        tabIndex={0}
        className="cursor-ns-resize touch-none rounded-full outline-none transition-transform duration-150 active:scale-[0.96] focus-visible:ring-2 focus-visible:ring-accent/50"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
            e.preventDefault()
            onChange(Math.min(param.max, value + 1))
          } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
            e.preventDefault()
            onChange(Math.max(param.min, value - 1))
          }
        }}
        onDoubleClick={() => onChange(param.default)}
        title="Arraste verticalmente · Shift = fino · duplo clique = padrão"
      >
        <svg width="64" height="64" viewBox="0 0 64 64">
          <circle
            cx="32"
            cy="32"
            r={RADIUS}
            fill="none"
            stroke="var(--color-raised)"
            strokeWidth="3"
          />
          <circle
            cx="32"
            cy="32"
            r={RADIUS}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={`${C * Math.max(t, 0.001)} ${C}`}
            transform={`rotate(${START_ANGLE} 32 32)`}
          />
          <line
            x1="32"
            y1="32"
            x2="32"
            y2="12"
            stroke="var(--color-ink)"
            strokeWidth="3"
            strokeLinecap="round"
            transform={`rotate(${angle} 32 32)`}
          />
          <circle cx="32" cy="32" r="3" fill="var(--color-ink)" />
        </svg>
      </div>
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-[11px] font-medium tracking-wide text-dim uppercase">
          {param.label}
        </span>
        <span className="font-mono text-xs text-ink">
          {param.format ? param.format(value) : value}
          {zone && (
            <span className="ml-1.5 text-[10px] text-accent">{zone.label}</span>
          )}
        </span>
      </div>
    </div>
  )
}
