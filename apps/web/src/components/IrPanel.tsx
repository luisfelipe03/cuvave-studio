import { useRef, useState } from 'react'
import { FileAudio, UploadSimple } from '@phosphor-icons/react'
import type { DeviceProfile } from 'profiles'

interface IrPanelProps {
  profile: DeviceProfile
}

export function IrPanel({ profile }: IrPanelProps) {
  const [slot, setSlot] = useState(1)
  const [distance, setDistance] = useState(60)
  const [file, setFile] = useState<File | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const { slots, distanceRange, sampleRate } = profile.irFormat

  return (
    <div className="flex flex-col gap-6 rounded-2xl border border-line bg-panel p-8">
      <div className="flex items-center gap-2">
        <FileAudio size={18} weight="bold" className="text-accent" />
        <h2 className="text-sm font-semibold tracking-wide uppercase">
          Enviar IR ao pedal
        </h2>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-dim">Posição (slot)</span>
        <div className="flex gap-1 rounded-lg border border-line bg-bg p-1">
          {Array.from({ length: slots }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              onClick={() => setSlot(n)}
              className={`h-9 flex-1 rounded-md font-mono text-sm font-medium transition-all duration-200 active:scale-[0.96] ${
                n === slot
                  ? 'bg-accent text-accent-ink shadow-soft'
                  : 'text-dim hover:bg-raised hover:text-ink'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
        <span className="text-xs text-faint">
          importar sobrescreve o slot escolhido
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-medium text-dim">
            Distância do microfone
          </span>
          <span className="font-mono text-xs text-ink">{distance}%</span>
        </div>
        <input
          type="range"
          min={distanceRange[0]}
          max={distanceRange[1]}
          value={distance}
          onChange={(e) => setDistance(Number(e.target.value))}
          className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-raised accent-[var(--color-accent)]"
        />
        <span
          className={`text-xs ${distance >= 99 ? 'text-accent' : 'text-faint'}`}
        >
          {distance >= 99
            ? '100% = silêncio: afaste o microfone antes de testar'
            : 'mais perto = mais alto'}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-dim">
          Arquivo WAV ({sampleRate / 1000}kHz / 24bit)
        </span>
        <input
          ref={inputRef}
          type="file"
          accept=".wav,audio/wav"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <button
          onClick={() => inputRef.current?.click()}
          className="flex h-11 items-center justify-center gap-2 rounded-lg border border-dashed border-line text-sm text-dim transition-colors hover:border-accent/40 hover:text-ink"
        >
          <UploadSimple size={16} />
          {file ? file.name : 'Escolher arquivo WAV'}
        </button>
        {file && (
          <span className="font-mono text-xs text-faint">
            {(file.size / 1024).toFixed(1)} KB
          </span>
        )}
      </div>

      <button
        disabled
        title="O envio real ao pedal entra no M3, depois do protocolo validado"
        className="h-11 rounded-lg border border-line bg-raised text-sm font-medium text-faint"
      >
        Enviar ao pedal (em breve)
      </button>
    </div>
  )
}
