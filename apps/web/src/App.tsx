import { useState } from 'react'
import {
  FileAudio,
  SlidersHorizontal,
  Sparkle,
} from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'
import { cubeBabyProfile } from 'profiles'
import { usePresets } from './state/usePresets'
import { useDevice } from './state/useDevice'
import { loadApiKey, saveApiKey } from './lib/storage'
import { DeviceBar } from './components/DeviceBar'
import { PresetEditor } from './components/PresetEditor'
import { AiPanel } from './components/AiPanel'
import { IrPanel } from './components/IrPanel'
import { SettingsDialog } from './components/SettingsDialog'

type View = 'presets' | 'ir' | 'ai'

const NAV: { id: View; label: string; icon: Icon }[] = [
  { id: 'presets', label: 'Presets', icon: SlidersHorizontal },
  { id: 'ir', label: 'Enviar IR', icon: FileAudio },
  { id: 'ai', label: 'IA', icon: Sparkle },
]

export default function App() {
  const profile = cubeBabyProfile
  const presetsState = usePresets(profile)
  const device = useDevice(profile)
  const [view, setView] = useState<View>('presets')
  const [apiKey, setApiKey] = useState(loadApiKey)
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <div className="min-h-[100dvh]">
      <DeviceBar
        profileName={profile.name}
        status={device}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 md:flex-row">
        <nav className="flex shrink-0 gap-1 md:flex-col md:pr-4">
          {NAV.map((item) => {
            const active = view === item.id
            return (
              <button
                key={item.id}
                onClick={() => setView(item.id)}
                className={`flex h-10 flex-1 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-all duration-200 active:scale-[0.97] md:flex-none md:justify-start ${
                  active
                    ? 'bg-raised text-ink shadow-soft'
                    : 'text-dim hover:bg-raised/60 hover:text-ink'
                }`}
              >
                <item.icon
                  size={16}
                  weight={active ? 'bold' : 'regular'}
                  className={active ? 'text-accent' : undefined}
                />
                {item.label}
              </button>
            )
          })}
        </nav>

        <main className="min-w-0 flex-1">
          {view === 'presets' && (
            <PresetEditor profile={profile} state={presetsState} />
          )}
          {view === 'ir' && <IrPanel profile={profile} />}
          {view === 'ai' && (
            <AiPanel
              profile={profile}
              apiKey={apiKey}
              onApply={(presets) => {
                presetsState.applyPresets(presets)
                setView('presets')
              }}
              onOpenSettings={() => setSettingsOpen(true)}
            />
          )}
        </main>
      </div>

      <footer className="mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6">
        <p className="text-xs text-faint">
          Modo demo — a comunicação com o pedal entra no M2. Presets ficam
          salvos neste navegador.
        </p>
      </footer>

      {settingsOpen && (
        <SettingsDialog
          initialKey={apiKey}
          onSave={(key) => {
            saveApiKey(key)
            setApiKey(key)
          }}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  )
}
