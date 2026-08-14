import { useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, WheelEvent } from 'react'
import type { Parameter } from 'profiles'

/**
 * Convenção física de knob: mínimo em ~7:30 (baixo-esquerda), sweep no
 * sentido horário PASSANDO PELO TOPO até ~4:30 (baixo-direita) — o vão sem
 * indicação fica embaixo. Em ângulo SVG (0° = 3h, sentido horário positivo,
 * y pra baixo) isso é START=135°, SWEEP=270° até 45°.
 */
const START_ANGLE = 135
const SWEEP = 270
const RADIUS = 27
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
  const [dragging, setDragging] = useState(false)
  const [focused, setFocused] = useState(false)
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

  // Só entra em modo de arrasto com um pointerdown explícito — mover ou
  // passar o mouse por cima nunca altera o valor sozinho.
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    drag.current = { startY: e.clientY, startValue: value }
    setDragging(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current) setFromPointer(e.clientY)
  }

  const endDrag = () => {
    drag.current = null
    setDragging(false)
  }

  // Scroll do mouse só ajusta depois de um clique prévio (foco) — nunca
  // no simples hover.
  const onWheel = (e: WheelEvent<HTMLDivElement>) => {
    if (!focused) return
    e.preventDefault()
    const step = e.shiftKey ? 1 : 4
    const delta = e.deltaY < 0 ? step : -step
    onChange(Math.min(param.max, Math.max(param.min, value + delta)))
  }

  return (
    <div className="flex w-[72px] select-none flex-col items-center gap-2">
      <div
        role="slider"
        aria-label={param.label}
        aria-valuemin={param.min}
        aria-valuemax={param.max}
        aria-valuenow={value}
        tabIndex={0}
        className="cursor-ns-resize touch-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onWheel={onWheel}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
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
        title="Clique e arraste verticalmente · duplo clique = padrão"
      >
        <svg
          width="64"
          height="64"
          viewBox="0 0 64 64"
          className={dragging ? 'scale-[1.04] transition-transform' : 'transition-transform'}
        >
          {/* corpo recesso do knob */}
          <circle cx="32" cy="32" r="19" fill="var(--color-raised)" />
          <circle
            cx="32"
            cy="32"
            r="19"
            fill="none"
            stroke="black"
            strokeOpacity="0.25"
            strokeWidth="1"
          />
          {/* trilho */}
          <circle
            cx="32"
            cy="32"
            r={RADIUS}
            fill="none"
            stroke="var(--color-line)"
            strokeWidth="2.5"
            strokeDasharray={`${(C * SWEEP) / 360} ${C}`}
            transform={`rotate(${START_ANGLE} 32 32)`}
            strokeLinecap="round"
          />
          {/* progresso */}
          <circle
            cx="32"
            cy="32"
            r={RADIUS}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={`${(C * SWEEP * Math.max(t, 0.001)) / 360} ${C}`}
            transform={`rotate(${START_ANGLE} 32 32)`}
          />
          {/* ponteiro */}
          <line
            x1="32"
            y1="32"
            x2="32"
            y2="16"
            stroke="var(--color-ink)"
            strokeWidth="2.5"
            strokeLinecap="round"
            transform={`rotate(${angle} 32 32)`}
          />
          <circle cx="32" cy="32" r="2.5" fill="var(--color-ink)" />
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
