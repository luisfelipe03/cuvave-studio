import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  cubeBabyProfile,
  normalizeSections,
  profiles,
  sectionForParam,
} from 'profiles'
import type { PresetValues } from 'profiles'
import { usePresets } from './state/usePresets'
import { useDevice } from './state/useDevice'
import { usePedal } from './state/usePedal'
import { useCloudSync } from './state/useCloudSync'
import { usePlaylists } from './state/usePlaylists'
import { slotsToValues, valuesToSlots } from './lib/pedalBank'
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
  const playlistsState = usePlaylists()
  const cloud = useCloudSync({
    profile,
    presetsState,
    library,
    setLibrary,
    playlists: playlistsState.playlists,
    setPlaylists: playlistsState.setPlaylists,
    guitar,
    setGuitar,
  })

  // M2: a sessão de protocolo com o pedal (leitura, escrita viva, save).
  const pedal = usePedal(device.ports)
  const pedalReady =
    device.status.kind === 'connected' && device.ports !== null && !demo

  // Ao conectar, o pedal é a fonte da verdade: lê o bank e preenche o editor.
  useEffect(() => {
    if (device.status.kind !== 'connected' || !device.ports || demo) return
    let cancelled = false
    void pedal.readBank().then((slots) => {
      if (cancelled || !slots) return
      presetsState.replaceAll(slotsToValues(profile, slots))
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device.status.kind, device.ports, demo])

  /** Knob mexido: atualiza local + manda o write vivo pro pedal na hora. */
  const applyParam = useCallback(
    (paramId: string, value: number) => {
      const slot = presetsState.active
      presetsState.setParam(paramId, value)
      const sec = sectionForParam(paramId, value)
      if (sec) presetsState.setParam(sec.id, sec.value)
      if (pedalReady) {
        const offset = profile.bankOrder.indexOf(paramId)
        if (offset >= 0) pedal.writeLive(slot, offset, value)
        if (sec) {
          const secOffset = profile.bankOrder.indexOf(sec.id)
          if (secOffset >= 0) pedal.writeLive(slot, secOffset, sec.value)
        }
      }
    },
    [presetsState, pedalReady, pedal, profile],
  )

  /** Salvar: localStorage + imagem do bank no pedal (aplica e persiste). */
  const persist = useCallback(() => {
    presetsState.persist()
    if (pedalReady) {
      void pedal.saveBank(valuesToSlots(profile, presetsState.presets))
    }
  }, [presetsState, pedalReady, pedal, profile])

  /**
   * Aplicar preset externo (IA, playlist) num slot: estado local + todos os
   * campos visíveis do slot como live writes (o pedal acompanha na hora) +
   * gravação da imagem do bank (persiste na flash) + localStorage em dia.
   */
  const lastAppliedSlot = useRef<number | null>(null)

  const pushSlotToPedal = useCallback(
    async (index: number, all: PresetValues[]) => {
      const normalized = normalizeSections(profile, all[index])
      for (const param of profile.parameters) {
        if (param.hidden) continue
        const offset = profile.bankOrder.indexOf(param.id)
        if (offset >= 0) pedal.writeLive(index, offset, normalized[param.id])
      }
      const ok = await pedal.saveBank(valuesToSlots(profile, all))
      if (ok) presetsState.commitLocal(all)
    },
    [pedal, presetsState, profile],
  )

  const applyPreset = useCallback(
    (index: number, values: PresetValues) => {
      const next = presetsState.presets.map((p, i) =>
        i === index ? normalizeSections(profile, values) : p,
      )
      lastAppliedSlot.current = index
      presetsState.applyPreset(index, values)
      if (pedalReady) void pushSlotToPedal(index, next)
    },
    [presetsState, pedalReady, pushSlotToPedal, profile],
  )

  /** Desfazer uma aplicação também empurra os valores antigos pro pedal. */
  const undoApply = useCallback(() => {
    const prev = presetsState.undoSnapshot
    const slot = lastAppliedSlot.current
    presetsState.undoApply()
    if (pedalReady && prev && slot !== null && prev[slot]) {
      void pushSlotToPedal(slot, prev)
    }
  }, [presetsState, pedalReady, pushSlotToPedal])

  // O editor recebe o estado com os métodos enfaixados no pedal.
  const editorState = useMemo(
    () => ({
      ...presetsState,
      setParam: applyParam,
      applyPreset,
      undoApply,
      persist,
    }),
    [presetsState, applyParam, applyPreset, undoApply, persist],
  )

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
          pedalStatus={pedal.status}
          pedalError={pedal.error}
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
            presetsState={editorState}
            apiKey={apiKey}
            guitar={guitar}
            library={library}
            playlists={playlistsState}
            onLibraryChange={setLibrary}
            onOpenSettings={() => setSettingsOpen(true)}
          />
          <p className="mx-auto max-w-[1400px] px-4 pb-8 text-xs text-faint sm:px-6">
            {device.status.kind === 'connected'
              ? pedal.status === 'error'
                ? `Erro ao falar com o pedal: ${pedal.error ?? 'desconhecido'}`
                : 'Pedal conectado — knobs editam ao vivo; Salvar grava no pedal.'
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
