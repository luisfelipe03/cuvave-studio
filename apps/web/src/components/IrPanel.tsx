import { useRef, useState } from 'react'
import { CaretDown, FileAudio, UploadSimple } from '@phosphor-icons/react'
import type { DeviceProfile } from 'profiles'

interface IrPanelProps {
  profile: DeviceProfile
}

export function IrPanel({ profile }: IrPanelProps) {
  const [open, setOpen] = useState(false)
  const [slot, setSlot] = useState(1)
  const [distance, setDistance] = useState(60)
  const [file, setFile] = useState<File | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const { slots, distanceRange, sampleRate } = profile.irFormat

  return (
    <section
      aria-labelledby="ir-heading"
      className="rounded-2xl border border-line bg-panel"
    >
      <h2 id="ir-heading">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="ir-body"
          className="flex w-full cursor-pointer items-center gap-2 rounded-2xl p-5 text-left"
        >
          <FileAudio size={18} weight="bold" className="text-accent" />
          <span className="flex-1 text-sm font-semibold tracking-wide uppercase">
            Enviar IR ao pedal
          </span>
          <span className="text-[10px] tracking-wide text-faint uppercase">
            M3
          </span>
          <CaretDown
            size={13}
            weight="bold"
            className={`text-dim transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          />
        </button>
      </h2>

      {open && (
      <div id="ir-body" className="flex flex-col gap-5 px-5 pb-5">

      <div className="flex flex-col gap-2">
        <span id="ir-slot-label" className="text-xs font-medium text-dim">
          Posição (slot)
        </span>
        <div
          role="radiogroup"
          aria-labelledby="ir-slot-label"
          className="grid grid-cols-4 gap-1.5"
        >
          {Array.from({ length: slots }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={n === slot}
              aria-label={`Slot ${n}`}
              onClick={() => setSlot(n)}
              className={`tabular h-11 cursor-pointer rounded-md border font-mono text-sm font-medium transition-colors duration-200 ${
                n === slot
                  ? 'border-transparent bg-accent text-accent-ink'
                  : 'border-line text-dim hover:bg-raised hover:text-ink'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
        <span className="text-xs text-faint">
          Importar sobrescreve o slot escolhido.
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <label htmlFor="ir-distance" className="text-xs font-medium text-dim">
            Distância do microfone
          </label>
          <span className="tabular font-mono text-xs text-ink">{distance}%</span>
        </div>
        <input
          id="ir-distance"
          type="range"
          min={distanceRange[0]}
          max={distanceRange[1]}
          value={distance}
          aria-describedby="ir-distance-help"
          onChange={(e) => setDistance(Number(e.target.value))}
          className="h-11 w-full cursor-pointer accent-[var(--color-accent)]"
        />
        <span
          id="ir-distance-help"
          className={`text-xs ${distance >= 99 ? 'text-accent' : 'text-faint'}`}
        >
          {distance >= 99
            ? '100% é silêncio — aproxime o microfone antes de testar.'
            : 'Mais perto, mais alto.'}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-dim">
          Arquivo WAV ({sampleRate / 1000}kHz / 24 bit)
        </span>
        <input
          ref={inputRef}
          type="file"
          accept=".wav,audio/wav"
          className="sr-only"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong px-3 text-sm text-dim transition-colors hover:border-accent/50 hover:text-ink"
        >
          <UploadSimple size={16} className="shrink-0" />
          <span className="truncate">
            {file ? file.name : 'Escolher arquivo WAV'}
          </span>
        </button>
        {file && (
          <span className="tabular font-mono text-xs text-faint">
            {(file.size / 1024).toFixed(1)} KB
          </span>
        )}
      </div>

      <button
        type="button"
        disabled
        title="O envio real ao pedal entra no M3, depois do protocolo validado com o hardware"
        className="h-11 rounded-lg border border-line bg-raised text-sm font-medium text-faint"
      >
        Enviar ao pedal (em breve)
      </button>
      </div>
      )}
    </section>
  )
}
