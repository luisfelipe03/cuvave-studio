import { GearSix, WarningCircle, Waveform } from '@phosphor-icons/react'
import type { DeviceProfile } from 'profiles'
import type { DeviceStatus } from '../state/useDevice'
import { DeviceSelector } from './DeviceSelector'

interface DeviceBarProps {
  profile: DeviceProfile
  profiles: DeviceProfile[]
  status: DeviceStatus
  demo: boolean
  onOpenSettings: () => void
}

function StatusDot({ tone }: { tone: 'ok' | 'warn' | 'idle' }) {
  const color =
    tone === 'ok' ? 'bg-ok' : tone === 'warn' ? 'bg-accent' : 'bg-faint'
  return (
    <span className="relative flex h-2 w-2">
      {tone === 'ok' && (
        <span
          className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-50 ${color}`}
        />
      )}
      <span className={`relative inline-flex h-2 w-2 rounded-full ${color}`} />
    </span>
  )
}

export function DeviceBar({
  profile,
  profiles,
  status,
  demo,
  onOpenSettings,
}: DeviceBarProps) {
  const text = (() => {
    switch (status.kind) {
      case 'unsupported':
        return {
          tone: 'warn' as const,
          label: 'Navegador sem Web MIDI — use Chrome ou Edge',
        }
      case 'idle':
        return { tone: 'idle' as const, label: 'Pedal não conectado' }
      case 'requesting':
        return { tone: 'idle' as const, label: 'Pedindo permissão…' }
      case 'denied':
        return { tone: 'warn' as const, label: 'Permissão de MIDI negada' }
      case 'disconnected':
        return { tone: 'warn' as const, label: 'Pedal não encontrado' }
      case 'connected':
        return { tone: 'ok' as const, label: status.name }
    }
  })()

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-[1400px] items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/12">
            <Waveform size={15} weight="bold" className="text-accent" />
          </div>
          <span className="text-sm font-semibold tracking-tight">
            Cuvave Studio
          </span>
          <DeviceSelector active={profile} profiles={profiles} />
          {demo && status.kind !== 'connected' && (
            <span className="hidden rounded-md bg-accent/12 px-2 py-0.5 font-mono text-[10px] tracking-wide text-accent uppercase sm:inline">
              modo demo
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div
            className="flex items-center gap-2 text-xs text-dim"
            title="Detecção via Web MIDI — protocolo real entra no M2"
          >
            <StatusDot tone={text.tone} />
            <span className="max-w-[180px] truncate sm:max-w-none">
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
            type="button"
            onClick={onOpenSettings}
            aria-label="Abrir configurações"
            className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg text-dim transition-colors hover:bg-raised hover:text-ink"
          >
            <GearSix size={17} />
          </button>
        </div>
      </div>
    </header>
  )
}
