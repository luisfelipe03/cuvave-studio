import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, WheelEvent } from 'react'
import type { Parameter } from 'profiles'

/**
 * Interação de knob: arrasto, teclado, roda e o easing do ponteiro.
 *
 * Vive separado do desenho porque temos duas faces (a do painel do app e a
 * réplica do knob físico) e só o desenho muda entre elas — o comportamento
 * é o mesmo e não deve divergir.
 *
 * Convenção física: mínimo em ~7:30 (baixo-esquerda), sweep no sentido
 * horário PASSANDO PELO TOPO até ~4:30 — o vão sem indicação fica embaixo.
 * Em ângulo SVG (0° = 3h, horário positivo, y pra baixo) isso é START=135°,
 * SWEEP=270°.
 */
export const START_ANGLE = 135
export const SWEEP = 270

const PIXELS_PER_SWEEP = 140
const EASE_MS = 140

export function zoneFor(param: Parameter, value: number) {
  return param.zones?.find((z) => value >= z.min && value <= z.max)
}

/** Ponta do ponteiro num círculo de raio `len` centrado em (32,32). */
export function tipOf(angle: number, len: number) {
  const rad = (angle * Math.PI) / 180
  return { x: 32 + len * Math.cos(rad), y: 32 + len * Math.sin(rad) }
}

function prefersReducedMotion() {
  return (
    typeof matchMedia === 'function' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

export function useKnobInteraction(
  param: Parameter,
  value: number,
  onChange: (value: number) => void,
) {
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
  const angle = dragging ? START_ANGLE + SWEEP * dragT : displayAngle
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

  const clamp = (v: number) => Math.min(param.max, Math.max(param.min, v))
  const bigStep = Math.max(1, Math.round((param.max - param.min) / 10))

  const endDrag = () => {
    drag.current = null
    setDragT(null)
  }

  const handlers = {
    onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => {
      drag.current = { startY: e.clientY, startT: committedT }
      setDragT(committedT)
      displayRef.current = committedAngle
      setDisplayAngle(committedAngle)
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => {
      const d = drag.current
      if (!d) return
      const nextT = Math.min(
        1,
        Math.max(0, d.startT + (d.startY - e.clientY) / PIXELS_PER_SWEEP),
      )
      displayRef.current = START_ANGLE + SWEEP * nextT
      setDisplayAngle(displayRef.current)
      setDragT(nextT)
      const nextValue = Math.round(param.min + nextT * (param.max - param.min))
      if (nextValue !== value) onChange(nextValue)
    },
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
    // Scroll do mouse só ajusta depois de um clique prévio (foco) — nunca
    // no simples hover.
    onWheel: (e: WheelEvent<HTMLDivElement>) => {
      if (!focused) return
      e.preventDefault()
      const step = e.shiftKey ? 1 : 4
      onChange(clamp(value + (e.deltaY < 0 ? step : -step)))
    },
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
    onDoubleClick: () => onChange(param.default),
    onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
      switch (e.key) {
        case 'ArrowUp':
        case 'ArrowRight':
          e.preventDefault()
          onChange(clamp(value + 1))
          break
        case 'ArrowDown':
        case 'ArrowLeft':
          e.preventDefault()
          onChange(clamp(value - 1))
          break
        case 'PageUp':
          e.preventDefault()
          onChange(clamp(value + bigStep))
          break
        case 'PageDown':
          e.preventDefault()
          onChange(clamp(value - bigStep))
          break
        case 'Home':
          e.preventDefault()
          onChange(param.min)
          break
        case 'End':
          e.preventDefault()
          onChange(param.max)
          break
      }
    },
  }

  const aria = {
    role: 'slider' as const,
    'aria-label': param.label,
    'aria-valuemin': param.min,
    'aria-valuemax': param.max,
    'aria-valuenow': value,
    'aria-valuetext': zone ? `${readout} (${zone.label})` : readout,
    tabIndex: 0,
  }

  return { angle, readout, zone, handlers, aria }
}
