import type { DeviceProfile, PresetValues } from 'profiles'
import { PedalKnob } from './PedalKnob'
import type { LedColor } from './PedalKnob'

/**
 * Réplica do painel do Cube Baby, desenhada a partir das fotos do aparelho.
 *
 * A ordem, as cores dos LEDs e a serigrafia são as do pedal físico: VOLUME
 * é o único knob sem LED, os nove seguintes formam três blocos (verde
 * IR/Reverb, azul Delay/Mod, vermelho Tone/Amp) e as letras acima deles são
 * as seis cordas (E A D G B E) mais ▶ ■ ◀, que o afinador usa.
 *
 * TYPE e IR CAB são knobs no aparelho, não listas — aqui mostram o índice,
 * com o nome por extenso embaixo.
 */

interface KnobSpec {
  id: string
  label: string
  led: LedColor
  cap?: string
  numeric?: boolean
  /** módulo a que o knob pertence; apagado quando a seção está desligada */
  lit: (v: PresetValues) => boolean
}

const ON = () => true

const KNOBS: KnobSpec[] = [
  { id: 'volume', label: 'Volume', led: 'none', lit: ON },
  {
    id: 'ir_cab',
    label: 'IR Cab',
    led: 'green',
    cap: 'E',
    numeric: true,
    lit: (v) => (v.ir_section ?? 0) > 0,
  },
  { id: 'reverb', label: 'Reverb', led: 'green', cap: 'A', lit: (v) => (v.reverb ?? 0) > 0 },
  { id: 'mix', label: 'Mix', led: 'blue', cap: 'D', lit: (v) => (v.delay_section ?? 0) > 0 },
  { id: 'fb', label: 'FB', led: 'blue', cap: 'G', lit: (v) => (v.delay_section ?? 0) > 0 },
  { id: 'time', label: 'Time', led: 'blue', cap: 'B', lit: (v) => (v.delay_section ?? 0) > 0 },
  {
    id: 'mod',
    label: 'Mod',
    led: 'blue',
    cap: 'E',
    // zona morta do knob de modulação: 7–8 é o "off" do próprio aparelho
    lit: (v) => (v.mod ?? 7) <= 6 || (v.mod ?? 7) >= 9,
  },
  { id: 'tone', label: 'Tone', led: 'red', cap: '▶', lit: (v) => (v.tone_section ?? 0) > 0 },
  { id: 'gain', label: 'Gain', led: 'red', cap: '■', lit: (v) => (v.tone_section ?? 0) > 0 },
  {
    id: 'type',
    label: 'Type',
    led: 'red',
    cap: '◀',
    numeric: true,
    lit: (v) => (v.tone_section ?? 0) > 0,
  },
]

/** Serigrafia de cada footswitch: os dois módulos que ele alterna. */
const SWITCHES = [
  { left: 'IR CAB', right: 'REVERB', section: 'ir_section' },
  { left: 'DELAY', right: 'MOD', section: 'delay_section' },
  { left: 'TONE', right: 'AMP', section: 'tone_section' },
]

/** Instruções serigrafadas entre um footswitch e o seguinte. */
const BETWEEN = [
  ['EDIT/PRESET', 'HOLD BT'],
  ['LIVE/PRESET', 'HOLD TUNER'],
]

interface PedalPanelProps {
  profile: DeviceProfile
  values: PresetValues
  active: number
  onParam: (paramId: string, value: number) => void
  onSlot: (index: number) => void
}

export function PedalPanel({
  profile,
  values,
  active,
  onParam,
  onSlot,
}: PedalPanelProps) {
  const byId = (id: string) => profile.parameters.find((p) => p.id === id)

  return (
    <div className="flex justify-center">
      <div className="relative w-full max-w-[860px] px-3 pt-4">
        <div
          className="relative rounded-[14px] border border-white/8 px-5 pt-4 pb-6 shadow-soft-lg sm:px-8"
          style={{
            background:
              'linear-gradient(178deg, #212125 0%, #151517 38%, #101012 100%)',
          }}
        >
          {/* bisel superior */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px rounded-t-[14px] bg-white/12" />

          {/* jacks IN/OUT, que no aparelho despontam por cima da borda */}
          <Jack className="-top-3 left-6" />
          <Jack className="-top-3 right-6" />

          <div className="mb-3 flex items-start justify-between gap-4">
            <span className="font-mono text-[15px] font-black tracking-[0.14em] text-white italic">
              CUVAVE
            </span>
            <div className="flex items-center gap-5 pt-0.5">
              <StatusLed label="Bateria" on={false} color="#f59e0b" icon="bolt" />
              <StatusLed label="Bluetooth" on color="#3b82f6" icon="bt" />
            </div>
          </div>

          <div className="flex flex-wrap items-start justify-center gap-x-1 gap-y-5 sm:gap-x-2">
            {KNOBS.map((spec, i) => {
              const param = byId(spec.id)
              if (!param) return null
              return (
                <div key={spec.id} className={i === 1 ? 'sm:ml-4' : undefined}>
                  <PedalKnob
                    param={param}
                    value={values[spec.id] ?? param.default}
                    onChange={(v) => onParam(spec.id, v)}
                    led={spec.led}
                    cap={spec.cap}
                    label={spec.label}
                    numeric={spec.numeric}
                    lit={spec.lit(values)}
                    hint={
                      spec.numeric
                        ? param.format?.(values[spec.id] ?? param.default)
                        : undefined
                    }
                  />
                </div>
              )
            })}
          </div>

          <div
            role="radiogroup"
            aria-label="Preset em edição"
            className="mt-7 grid grid-cols-3 items-start gap-2 sm:grid-cols-[1fr_auto_1fr_auto_1fr]"
          >
            {SWITCHES.map((sw, i) => (
              <FootswitchGroup
                key={sw.left}
                index={i}
                label={profile.presetLabels[i] ?? String(i)}
                left={sw.left}
                right={sw.right}
                sectionOn={(values[sw.section] ?? 0) > 0}
                active={i === active}
                onClick={() => onSlot(i)}
                between={BETWEEN[i]}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function Jack({ className }: { className: string }) {
  return (
    <div
      aria-hidden="true"
      className={`absolute h-7 w-7 rounded-md border border-black/40 ${className}`}
      style={{
        background:
          'linear-gradient(145deg, #d8d8dc 0%, #8f8f96 45%, #c9c9cf 70%, #6f6f76 100%)',
        clipPath:
          'polygon(25% 0%, 75% 0%, 100% 30%, 100% 70%, 75% 100%, 25% 100%, 0% 70%, 0% 30%)',
      }}
    >
      <span className="absolute inset-[7px] rounded-full bg-black/70" />
    </div>
  )
}

function StatusLed({
  label,
  on,
  color,
  icon,
}: {
  label: string
  on: boolean
  color: string
  icon: 'bolt' | 'bt'
}) {
  return (
    <span className="flex items-center gap-1.5" title={label}>
      <svg width="11" height="11" viewBox="0 0 16 16" aria-hidden="true">
        {icon === 'bolt' ? (
          <path d="M9 1 3 9h4l-1 6 6-8H8l1-6z" fill="#ffffff" fillOpacity="0.5" />
        ) : (
          <path
            d="M8 1v6l3-3-3-3m0 6v6l3-3-3-3M5 5l6 6M5 11l6-6"
            stroke="#ffffff"
            strokeOpacity="0.5"
            strokeWidth="1.2"
            fill="none"
          />
        )}
      </svg>
      <span
        className="h-2 w-2 rounded-full"
        style={{
          background: on ? color : '#2a2a2e',
          boxShadow: on ? `0 0 7px ${color}` : 'inset 0 0 2px #000',
        }}
      />
      <span className="sr-only">
        {label}: {on ? 'ligado' : 'desligado'}
      </span>
    </span>
  )
}

function FootswitchGroup({
  index,
  label,
  left,
  right,
  sectionOn,
  active,
  onClick,
  between,
}: {
  index: number
  label: string
  left: string
  right: string
  sectionOn: boolean
  active: boolean
  onClick: () => void
  between?: string[]
}) {
  return (
    <>
      <div className="flex flex-col items-center gap-1.5">
        <span className="flex items-center gap-1.5 text-[8.5px] font-bold tracking-wider text-white/70 uppercase">
          {left}
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 rounded-full"
            style={{
              background: sectionOn ? '#22c55e' : '#2a2a2e',
              boxShadow: sectionOn ? '0 0 6px #22c55e' : 'inset 0 0 2px #000',
            }}
          />
          {right}
        </span>

        <button
          type="button"
          role="radio"
          aria-checked={active}
          aria-label={`Preset ${label}`}
          onClick={onClick}
          className={`relative h-12 w-12 cursor-pointer rounded-full border transition-[box-shadow,border-color] duration-200 ${
            active
              ? 'border-accent/70 shadow-[0_0_0_3px_rgba(178,140,98,0.28)]'
              : 'border-black/60 hover:border-white/25'
          }`}
          style={{
            background:
              'radial-gradient(circle at 36% 30%, #f2f2f4 0%, #b9b9c0 38%, #7b7b83 68%, #4b4b52 100%)',
          }}
        >
          <span
            aria-hidden="true"
            className="absolute inset-[10px] rounded-full"
            style={{
              background:
                'linear-gradient(160deg, #fbfbfd 0%, #c2c2c9 55%, #8d8d95 100%)',
            }}
          />
        </button>

        <span
          className={`font-mono text-xs font-bold ${
            active ? 'text-accent' : 'text-white/60'
          }`}
        >
          {label}
        </span>
      </div>

      {between && (
        <div className="hidden flex-col items-center gap-0.5 self-center sm:flex">
          {between.map((line) => (
            <span
              key={line}
              className="text-[7.5px] font-semibold tracking-wide text-white/35 uppercase"
            >
              ‹ {line} ›
            </span>
          ))}
        </div>
      )}
      {/* o grupo do meio não tem legenda depois dele em telas estreitas */}
      {!between && index === 2 && null}
    </>
  )
}
