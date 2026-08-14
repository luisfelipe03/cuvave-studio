import { useEffect, useRef, useState } from 'react'
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
const POINTER_LEN = 16
const C = 2 * Math.PI * RADIUS
const PIXELS_PER_SWEEP = 140
const EASE_MS = 140

function zoneFor(param: Parameter, value: number) {
  return param.zones?.find((z) => value >= z.min && value <= z.max)
}

function tipOf(angle: number) {
  const rad = (angle * Math.PI) / 180
  return {
    x: 32 + POINTER_LEN * Math.cos(rad),
    y: 32 + POINTER_LEN * Math.sin(rad),
  }
}

function prefersReducedMotion() {
  return (
    typeof matchMedia === 'function' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches
  )
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
  // o ângulo vem do valor real (já quantizado) com easing via rAF.
  const [dragT, setDragT] = useState<number | null>(null)
  const [focused, setFocused] = useState(false)
  const [displayAngle, setDisplayAngle] = useState(
    () => START_ANGLE + (SWEEP * (value - param.min)) / (param.max - param.min),
  )
  const displayRef = useRef(displayAngle)

  const committedT = (value - param.min) / (param.max - param.min)
  const committedAngle = START_ANGLE + SWEEP * committedT
  const zone = zoneFor(param, value)
  const dragging = dragT !== null
  const angle = dragging ? START_ANGLE + SWEEP * (dragT as number) : displayAngle
  const readout = param.format ? param.format(value) : String(value)

  // Easing do ponteiro quando o valor muda por fora do arrasto (teclado, IA,
  // troca de preset, duplo clique). Durante o arrasto o ponteiro segue o
  // mouse direto. Quem pediu menos movimento no SO recebe o salto direto.
  useEffect(() => {
    if (dragging) return
    const from = displayRef.current
    const to = committedAngle
    if (Math.abs(to - from) < 0.001) return
    if (prefersReducedMotion()) {
      displayRef.current = to
      setDisplayAngle(to)
      return
    }
    const start = performance.now()
    let raf = 0
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / EASE_MS)
      const eased = 1 - Math.pow(1 - t, 3)
      const next = from + (to - from) * eased
      displayRef.current = next
      setDisplayAngle(next)
      if (t < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [committedAngle, dragging])

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    drag.current = { startY: e.clientY, startT: committedT }
    setDragT(committedT)
    displayRef.current = committedAngle
    setDisplayAngle(committedAngle)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d) return
    const nextT = Math.min(
      1,
      Math.max(0, d.startT + (d.startY - e.clientY) / PIXELS_PER_SWEEP),
    )
    const nextAngle = START_ANGLE + SWEEP * nextT
    displayRef.current = nextAngle
    setDisplayAngle(nextAngle)
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

  const tip = tipOf(angle)
  const span = param.max - param.min
  const bigStep = Math.max(1, Math.round(span / 10))

  return (
    <div className="flex w-[72px] flex-col items-center gap-2 select-none">
      <div
        role="slider"
        aria-label={param.label}
        aria-valuemin={param.min}
        aria-valuemax={param.max}
        aria-valuenow={value}
        aria-valuetext={zone ? `${readout} (${zone.label})` : readout}
        tabIndex={0}
        className="cursor-ns-resize touch-none rounded-full"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onWheel={onWheel}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          const set = (v: number) =>
            onChange(Math.min(param.max, Math.max(param.min, v)))
          switch (e.key) {
            case 'ArrowUp':
            case 'ArrowRight':
              e.preventDefault()
              set(value + 1)
              break
            case 'ArrowDown':
            case 'ArrowLeft':
              e.preventDefault()
              set(value - 1)
              break
            case 'PageUp':
              e.preventDefault()
              set(value + bigStep)
              break
            case 'PageDown':
              e.preventDefault()
              set(value - bigStep)
              break
            case 'Home':
              e.preventDefault()
              set(param.min)
              break
            case 'End':
              e.preventDefault()
              set(param.max)
              break
          }
        }}
        onDoubleClick={() => onChange(param.default)}
        title="Arraste na vertical · setas ajustam · duplo clique volta ao padrão"
      >
        <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">
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
          {/* progresso — acompanha o ponteiro (contínuo durante o arrasto) */}
          <circle
            cx="32"
            cy="32"
            r={RADIUS}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={`${(C * SWEEP * Math.max((angle - START_ANGLE) / SWEEP, 0.001)) / 360} ${C}`}
            transform={`rotate(${START_ANGLE} 32 32)`}
          />
          {/* ponteiro — coordenadas por trigonometria (sem transform CSS:
              transform-origin é ignorado pelo Chrome em elementos SVG sem
              layout box, o que deixava traço fantasma fora do círculo) */}
          <line
            x1="32"
            y1="32"
            x2={tip.x}
            y2={tip.y}
            stroke="var(--color-ink)"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <circle cx="32" cy="32" r="2.5" fill="var(--color-ink)" />
        </svg>
      </div>
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-[11px] font-medium tracking-wide text-dim uppercase">
          {param.label}
        </span>
        <span className="tabular font-mono text-xs text-ink">
          {readout}
          {zone && (
            <span className="ml-1.5 text-[10px] text-accent">{zone.label}</span>
          )}
        </span>
      </div>
    </div>
  )
}
