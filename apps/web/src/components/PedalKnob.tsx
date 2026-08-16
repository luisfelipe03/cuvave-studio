import { useId } from 'react'
import type { Parameter } from 'profiles'
import { START_ANGLE, SWEEP, tipOf, useKnobInteraction } from './knobInteraction'

/**
 * Réplica do knob físico do Cube Baby: cápsula translúcida iluminada por
 * um LED, serrilhado na lateral e escala de pontinhos em volta.
 *
 * As cores são as do aparelho — verde no bloco de IR/Reverb, azul no de
 * Delay/Mod, vermelho no de Tone/Amp. O VOLUME é o único sem LED (branco
 * leitoso), como no pedal.
 */
export type LedColor = 'green' | 'blue' | 'red' | 'none'

const LED: Record<LedColor, { core: string; rim: string; glow: string }> = {
  green: { core: '#8affb4', rim: '#22c55e', glow: '#22c55e' },
  blue: { core: '#9cc4ff', rim: '#3b82f6', glow: '#3b82f6' },
  red: { core: '#ffa3a3', rim: '#ef4444', glow: '#ef4444' },
  none: { core: '#f4f4f5', rim: '#a1a1aa', glow: '#71717a' },
}

const OFF = { core: '#3f3f46', rim: '#27272a', glow: '#000000' }

/** Serrilhado da cápsula: traços radiais como os do knob real. */
const TEETH = Array.from({ length: 24 }, (_, i) => (i * 360) / 24)
/** Escala de pontinhos, só ao longo do curso útil do knob. */
const DOTS = Array.from({ length: 19 }, (_, i) => START_ANGLE + (SWEEP * i) / 18)

interface PedalKnobProps {
  param: Parameter
  value: number
  onChange: (value: number) => void
  led: LedColor
  /** letra serigrafada acima do knob no pedal (E, A, D, G, B, E, ▶, ■, ◀) */
  cap?: string
  /** nome como vem impresso no corpo do pedal */
  label: string
  /** módulo desligado → LED apagado, igual ao aparelho */
  lit?: boolean
  /** texto sob o valor (nome do preamp/gabinete, por exemplo) */
  hint?: string
  /**
   * Mostra o índice cru em vez do rótulo formatado. O pedal exibe número
   * nos knobs de TYPE e IR CAB — o nome por extenso vira `hint`.
   */
  numeric?: boolean
}

export function PedalKnob({
  param,
  value,
  onChange,
  led,
  cap,
  label,
  lit = true,
  hint,
  numeric,
}: PedalKnobProps) {
  const { angle, readout: formatted, zone, handlers, aria } = useKnobInteraction(
    param,
    value,
    onChange,
  )
  const readout = numeric ? String(value) : formatted
  const uid = useId().replace(/:/g, '')
  const c = lit ? LED[led] : OFF
  const tip = tipOf(angle, 12)

  return (
    <div className="flex w-[68px] flex-col items-center gap-1 select-none">
      <span
        aria-hidden="true"
        className="h-4 font-mono text-[11px] leading-4 font-bold text-white/70"
      >
        {cap}
      </span>

      <div
        {...aria}
        {...handlers}
        className="cursor-ns-resize touch-none rounded-full"
        title="Arraste na vertical · setas ajustam · duplo clique volta ao padrão"
      >
        <svg width="58" height="58" viewBox="0 0 64 64" aria-hidden="true">
          <defs>
            <radialGradient id={`cap-${uid}`} cx="38%" cy="30%" r="72%">
              <stop offset="0%" stopColor={c.core} />
              <stop offset="62%" stopColor={c.rim} />
              <stop offset="100%" stopColor={c.rim} stopOpacity="0.75" />
            </radialGradient>
            <filter id={`glow-${uid}`} x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="3.4" />
            </filter>
          </defs>

          {/* escala de pontinhos serigrafada em volta */}
          {DOTS.map((a) => {
            const p = tipOf(a, 26)
            return (
              <circle
                key={a}
                cx={p.x}
                cy={p.y}
                r="0.9"
                fill="#ffffff"
                fillOpacity="0.32"
              />
            )
          })}

          {/* halo do LED aceso */}
          {lit && (
            <circle
              cx="32"
              cy="32"
              r="19"
              fill={c.glow}
              fillOpacity="0.45"
              filter={`url(#glow-${uid})`}
            />
          )}

          {/* base preta onde a cápsula assenta */}
          <circle cx="32" cy="32" r="17.5" fill="#0c0c0e" />

          {/* serrilhado da lateral */}
          {TEETH.map((a) => {
            const outer = tipOf(a, 17)
            const inner = tipOf(a, 13.6)
            return (
              <line
                key={a}
                x1={inner.x}
                y1={inner.y}
                x2={outer.x}
                y2={outer.y}
                stroke={c.rim}
                strokeOpacity="0.8"
                strokeWidth="2"
                strokeLinecap="round"
              />
            )
          })}

          {/* cápsula translúcida iluminada */}
          <circle cx="32" cy="32" r="14" fill={`url(#cap-${uid})`} />
          <circle
            cx="32"
            cy="32"
            r="14"
            fill="none"
            stroke="#000000"
            strokeOpacity="0.35"
            strokeWidth="1"
          />
          {/* brilho especular no alto-esquerda, como na foto */}
          <ellipse
            cx="27"
            cy="26"
            rx="6"
            ry="4.4"
            fill="#ffffff"
            fillOpacity={lit ? 0.4 : 0.12}
            transform="rotate(-28 27 26)"
          />

          {/* marca de posição */}
          <line
            x1={tipOf(angle, 4).x}
            y1={tipOf(angle, 4).y}
            x2={tip.x}
            y2={tip.y}
            stroke="#0a0a0c"
            strokeOpacity="0.85"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
      </div>

      <div className="flex flex-col items-center">
        <span className="text-[10px] font-bold tracking-wider text-white/85 uppercase">
          {label}
        </span>
        <span
          className="tabular font-mono text-[11px] font-semibold"
          style={{ color: lit ? c.rim : '#71717a' }}
        >
          {lit ? readout : 'OFF'}
        </span>
        {/* apagado já diz "OFF" no valor — repetir a zona embaixo é ruído */}
        {lit && (hint || zone) && (
          <span className="max-w-[86px] truncate text-center text-[9px] text-white/45">
            {hint ?? zone?.label}
          </span>
        )}
      </div>
    </div>
  )
}
