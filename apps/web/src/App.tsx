import { useState } from 'react'
import { cubeBabyProfile, profiles } from 'profiles'
import { usePresets } from './state/usePresets'
import { useDevice } from './state/useDevice'
import {
  loadApiKey,
  loadGuitar,
  saveApiKey,
  saveGuitar,
} from './lib/storage'
import { DeviceBar } from './components/DeviceBar'
import { Home } from './components/Home'
import { EditorScreen } from './components/EditorScreen'
import { SettingsDialog } from './components/SettingsDialog'

export default function App() {
  const profile = cubeBabyProfile
  const presetsState = usePresets(profile)
  const device = useDevice(profile)
  const [demo, setDemo] = useState(false)
  const [apiKey, setApiKey] = useState(loadApiKey)
  const [guitar, setGuitar] = useState(loadGuitar)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const unlocked = demo || device.status.kind === 'connected'

  return (
    <div className="min-h-[100dvh]">
      {unlocked && (
        <DeviceBar
          profile={profile}
          profiles={profiles}
          status={device.status}
          demo={demo}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      )}

      {unlocked ? (
        <>
          <EditorScreen
            profile={profile}
            presetsState={presetsState}
            apiKey={apiKey}
            guitar={guitar}
            onOpenSettings={() => setSettingsOpen(true)}
          />
          <p className="mx-auto max-w-[1400px] px-4 pb-8 text-xs text-faint sm:px-6">
            {device.status.kind === 'connected'
              ? 'Comunicação real com o pedal entra no M2 — por enquanto os presets ficam salvos neste navegador.'
              : 'Modo demo — nenhum pedal conectado. Presets ficam salvos neste navegador.'}
          </p>
        </>
      ) : (
        <Home
          status={device.status}
          onConnect={device.connect}
          onDemo={() => setDemo(true)}
        />
      )}

      {settingsOpen && (
        <SettingsDialog
          initialKey={apiKey}
          initialGuitar={guitar}
          onSave={(key, nextGuitar) => {
            saveApiKey(key)
            setApiKey(key)
            saveGuitar(nextGuitar)
            setGuitar(nextGuitar)
          }}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  )
}
