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
const PIXELS_PER_SWEEP = 140
const TRANSITION = 'transform 120ms cubic-bezier(0.25,0.46,0.45,0.94)'

function zoneFor(param: Parameter, value: number) {
  return param.zones?.find((z) => value >= z.min && value <= z.max)
}

interface KnobProps {
  param: Parameter
  value: number
  onChange: (value: number) => void
}

export function Knob({ param, value, onChange }: KnobProps) {
  const drag = useRef<{ startY: number; startT: number } | null>(null)
  // t contínuo (0–1) só existe durante o arrasto — o ponteiro acompanha o
  // mouse pixel a pixel em vez de pular de passo em passo. Fora do arrasto,
  // o ângulo vem do valor real (já quantizado) e ganha transição suave.
  const [dragT, setDragT] = useState<number | null>(null)
  const [focused, setFocused] = useState(false)

  const committedT = (value - param.min) / (param.max - param.min)
  const t = dragT ?? committedT
  const angle = START_ANGLE + SWEEP * t
  const zone = zoneFor(param, value)
  const dragging = dragT !== null

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    drag.current = { startY: e.clientY, startT: committedT }
    setDragT(committedT)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d) return
    const nextT = Math.min(
      1,
      Math.max(0, d.startT + (d.startY - e.clientY) / PIXELS_PER_SWEEP),
    )
    setDragT(nextT)
    const nextValue = Math.round(param.min + nextT * (param.max - param.min))
    if (nextValue !== value) onChange(nextValue)
  }

  const endDrag = () => {
    drag.current = null
    setDragT(null)
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
          className="transition-transform"
          style={{ transform: dragging ? 'scale(1.04)' : undefined }}
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
          {/* ponteiro — a rotação é só CSS (nunca o atributo SVG `transform`,
              que é ambíguo pra transicionar junto com CSS). Anima suave fora
              do arrasto (teclado, IA, troca de preset); durante o arrasto
              acompanha o mouse direto, sem atraso de transição */}
          <line
            x1="32"
            y1="32"
            x2="32"
            y2="16"
            stroke="var(--color-ink)"
            strokeWidth="2.5"
            strokeLinecap="round"
            style={{
              transform: `rotate(${angle + 90}deg)`,
              transformBox: 'view-box',
              transformOrigin: '32px 32px',
              transition: dragging ? 'none' : TRANSITION,
            }}
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
