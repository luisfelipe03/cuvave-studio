import { useEffect, useRef, useState } from 'react'
import { cubeBabyProfile, profiles } from 'profiles'
import { usePresets } from './state/usePresets'
import { useDevice } from './state/useDevice'
import { useCloudSync } from './state/useCloudSync'
import { useAiAccess } from './state/useAiAccess'
import {
  loadApiKey,
  loadGuitar,
  loadLibrary,
  saveApiKey,
  saveGuitar,
} from './lib/storage'
import type { LibraryEntry } from './lib/storage'
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
  const [library, setLibrary] = useState<LibraryEntry[]>(() =>
    loadLibrary(profile),
  )
  const [settingsOpen, setSettingsOpen] = useState(false)

  // 'home' é a tela inicial (gate de conexão); 'editor' é o app de fato.
  // Voltar pra Home pelo botão na barra sai do modo demo e volta pro gate.
  const [screen, setScreen] = useState<'home' | 'editor'>('home')
  // Só entra sozinho no editor quando a conexão veio de um clique em
  // "Conectar pedal" — se o usuário pediu pra voltar pra Home, fica lá.
  const enterFromConnect = useRef(false)

  useEffect(() => {
    if (enterFromConnect.current && device.status.kind === 'connected') {
      enterFromConnect.current = false
      setScreen('editor')
    }
  }, [device.status.kind])

  // Login é opcional: sem ele o app roda inteiro no localStorage.
  const cloud = useCloudSync({
    profile,
    presetsState,
    library,
    setLibrary,
    guitar,
    setGuitar,
  })

  // Quem pode usar a chave compartilhada da IA (dono/aprovados).
  const aiAccess = useAiAccess(cloud.user)

  const unlocked = demo || device.status.kind === 'connected'
  const showEditor = screen === 'editor' && unlocked

  const goHome = () => {
    enterFromConnect.current = false
    setDemo(false)
    setScreen('home')
  }

  const connectFromHome = () => {
    if (device.status.kind === 'connected') {
      setScreen('editor')
      return
    }
    enterFromConnect.current = true
    device.connect()
  }

  return (
    <div className="min-h-[100dvh]">
      {showEditor && (
        <DeviceBar
          profile={profile}
          profiles={profiles}
          status={device.status}
          demo={demo}
          user={cloud.user}
          syncStatus={cloud.status}
          onSignIn={cloud.signIn}
          onSignOut={cloud.signOut}
          onHome={goHome}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      )}

      {showEditor ? (
        <>
          <EditorScreen
            profile={profile}
            presetsState={presetsState}
            apiKey={apiKey}
            guitar={guitar}
            library={library}
            user={cloud.user}
            aiAccess={aiAccess}
            onLibraryChange={setLibrary}
            onSignIn={() => void cloud.signIn()}
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
          onConnect={connectFromHome}
          onDemo={() => {
            setDemo(true)
            setScreen('editor')
          }}
        />
      )}

      {settingsOpen && (
        <SettingsDialog
          initialKey={apiKey}
          initialGuitar={guitar}
          user={cloud.user}
          aiAccess={aiAccess}
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
