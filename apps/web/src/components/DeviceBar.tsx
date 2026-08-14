import { GearSix, WarningCircle, Waveform } from '@phosphor-icons/react'
import type { DeviceStatus } from '../state/useDevice'

interface DeviceBarProps {
  profileName: string
  status: DeviceStatus
  onOpenSettings: () => void
}

function StatusDot({ tone }: { tone: 'ok' | 'warn' | 'idle' }) {
  const color =
    tone === 'ok' ? 'bg-emerald-400' : tone === 'warn' ? 'bg-accent' : 'bg-faint'
  return (
    <span className="relative flex h-2 w-2">
      {tone !== 'idle' && (
        <span
          className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${color}`}
        />
      )}
      <span className={`relative inline-flex h-2 w-2 rounded-full ${color}`} />
    </span>
  )
}

export function DeviceBar({
  profileName,
  status,
  onOpenSettings,
}: DeviceBarProps) {
  const text = (() => {
    switch (status.kind) {
      case 'scanning':
        return { tone: 'idle' as const, label: 'Procurando dispositivo MIDI…' }
      case 'unsupported':
        return {
          tone: 'warn' as const,
          label: 'Navegador sem Web MIDI — use Chrome ou Edge',
        }
      case 'disconnected':
        return { tone: 'warn' as const, label: 'Pedal não conectado — modo demo' }
      case 'connected':
        return { tone: 'ok' as const, label: status.name }
    }
  })()

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/15">
            <Waveform size={15} weight="bold" className="text-accent" />
          </div>
          <span className="text-sm font-semibold tracking-tight">
            Cuvave Studio
          </span>
          <span className="hidden rounded-md border border-line px-2 py-0.5 font-mono text-[10px] text-dim sm:inline">
            {profileName}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div
            className="flex items-center gap-2 text-xs text-dim"
            title="Detecção Web MIDI — protocolo entra no M2"
          >
            <StatusDot tone={text.tone} />
            <span className="max-w-[220px] truncate sm:max-w-none">
              {text.label}
            </span>
          </div>
          {status.kind === 'unsupported' && (
            <WarningCircle
              size={16}
              weight="fill"
              className="text-accent"
              aria-label="Web MIDI só existe em Chrome/Edge (Chromium)"
            />
          )}
          <button
            onClick={onOpenSettings}
            aria-label="Configurações"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-dim transition-all duration-200 hover:bg-raised hover:text-ink active:scale-[0.95]"
          >
            <GearSix size={17} />
          </button>
        </div>
      </div>
    </header>
  )
}
