import {
  Books,
  CloudCheck,
  CloudSlash,
  CloudWarning,
  Gear,
  HardDrives,
  SignIn,
  SignOut,
  Sliders,
  Sparkle,
} from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'
import type { DeviceProfile } from 'profiles'
import type { SyncStatus } from '../state/useCloudSync'
import type { User } from '../lib/firebase'

export type Section = 'editor' | 'ia' | 'biblioteca' | 'dispositivo'

const NAV: { id: Section; label: string; hint: string; icon: Icon }[] = [
  { id: 'editor', label: 'Editor', hint: 'Pedal e knobs', icon: Sliders },
  { id: 'ia', label: 'IA', hint: 'Gerar tons', icon: Sparkle },
  { id: 'biblioteca', label: 'Biblioteca', hint: 'Shows e playlists', icon: Books },
  { id: 'dispositivo', label: 'Dispositivo', hint: 'Bank e IR', icon: HardDrives },
]

interface SidebarProps {
  profile: DeviceProfile
  section: Section
  onSection: (section: Section) => void
  active: number
  onSlot: (index: number) => void
  connected: boolean
  demo: boolean
  user: User | null
  syncStatus: SyncStatus
  onSignIn: () => void
  onSignOut: () => void
  onSettings: () => void
  onLeave: () => void
}

export function Sidebar({
  profile,
  section,
  onSection,
  active,
  onSlot,
  connected,
  demo,
  user,
  syncStatus,
  onSignIn,
  onSignOut,
  onSettings,
  onLeave,
}: SidebarProps) {
  const slotLabel = profile.presetLabels[active] ?? '—'

  return (
    <aside className="flex w-full flex-col border-line border-b bg-panel lg:h-[100dvh] lg:w-[248px] lg:shrink-0 lg:border-r lg:border-b-0">
      <div className="px-5 pt-5 pb-4">
        <h1 className="text-[17px] font-semibold tracking-tight text-ink">
          Cuvave Studio
        </h1>
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-dim">
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 rounded-full"
            style={{
              background: connected ? 'var(--color-ok)' : 'var(--color-faint)',
              boxShadow: connected ? '0 0 6px var(--color-ok)' : undefined,
            }}
          />
          {profile.name} · {demo ? 'demo' : connected ? 'conectado' : 'offline'}
        </p>
      </div>

      <div className="border-line border-t px-5 py-4">
        <p className="mb-2 text-[10px] font-semibold tracking-[0.12em] text-faint uppercase">
          Footswitch
        </p>
        <div
          role="radiogroup"
          aria-label="Preset em edição"
          className="grid grid-cols-3 gap-1.5"
        >
          {profile.presetLabels.map((label, i) => (
            <button
              key={label}
              type="button"
              role="radio"
              aria-checked={i === active}
              aria-label={`Preset ${label}`}
              onClick={() => onSlot(i)}
              className={`h-10 cursor-pointer rounded-lg border font-mono text-sm font-semibold transition-colors duration-200 ${
                i === active
                  ? 'border-accent/60 bg-accent/15 text-accent'
                  : 'border-line bg-raised text-dim hover:text-ink'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-faint">
          {demo ? 'Demo' : 'Ao vivo'} · slot {slotLabel}
        </p>
      </div>

      <nav className="flex flex-1 flex-col gap-1 border-line border-t p-3">
        {NAV.map((item) => {
          const on = item.id === section
          const Icon = item.icon
          return (
            <button
              key={item.id}
              type="button"
              aria-current={on ? 'page' : undefined}
              onClick={() => onSection(item.id)}
              className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors duration-200 ${
                on
                  ? 'bg-accent/12 text-ink'
                  : 'text-dim hover:bg-raised hover:text-ink'
              }`}
            >
              <Icon
                size={17}
                weight={on ? 'fill' : 'regular'}
                className={on ? 'text-accent' : undefined}
              />
              <span className="flex flex-col leading-tight">
                <span className="text-sm font-medium">{item.label}</span>
                <span className="text-[11px] text-faint">{item.hint}</span>
              </span>
            </button>
          )
        })}
      </nav>

      <div className="flex flex-col gap-1 border-line border-t p-3">
        {user ? (
          <button
            type="button"
            onClick={onSignOut}
            title={`${user.email ?? 'Conectado'} — sair`}
            className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-dim transition-colors hover:bg-raised hover:text-ink"
          >
            {syncStatus === 'error' ? (
              <CloudWarning size={17} className="text-accent" />
            ) : syncStatus === 'merging' ? (
              <CloudCheck size={17} className="animate-pulse text-dim" />
            ) : (
              <CloudCheck size={17} className="text-ok" />
            )}
            <span className="min-w-0 flex-1 truncate text-left">
              {user.displayName ?? user.email}
            </span>
            <SignOut size={13} />
          </button>
        ) : (
          <button
            type="button"
            onClick={onSignIn}
            title="Entrar para sincronizar presets entre dispositivos"
            className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-dim transition-colors hover:bg-raised hover:text-ink"
          >
            <CloudSlash size={17} />
            <span className="flex-1 text-left">Entrar</span>
            <SignIn size={13} />
          </button>
        )}
        <button
          type="button"
          onClick={onSettings}
          className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-dim transition-colors hover:bg-raised hover:text-ink"
        >
          <Gear size={17} />
          Ajustes
        </button>
        <button
          type="button"
          onClick={onLeave}
          className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-dim transition-colors hover:bg-raised hover:text-ink"
        >
          <SignOut size={17} />
          Desconectar
        </button>
      </div>
    </aside>
  )
}
