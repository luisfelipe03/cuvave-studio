import { useState } from 'react'
import { ArrowCounterClockwise, Warning } from '@phosphor-icons/react'
import type { DeviceProfile } from 'profiles'
import type { LibraryEntry } from '../lib/storage'
import type { PresetsState } from '../state/usePresets'
import type { PlaylistsState } from '../state/usePlaylists'
import type { PedalLinkStatus } from '../state/usePedal'
import type { SyncStatus } from '../state/useCloudSync'
import type { User } from '../lib/firebase'
import { PedalPanel } from './PedalPanel'
import { SlotSelector } from './SlotSelector'
import { IrPanel } from './IrPanel'
import { AiPanel } from './AiPanel'
import { PlaylistSection } from './PlaylistSection'
import { Sidebar } from './Sidebar'
import type { Section } from './Sidebar'
import { TopBar } from './TopBar'

interface EditorScreenProps {
  profile: DeviceProfile
  presetsState: PresetsState
  apiKey: string
  guitar: string
  library: LibraryEntry[]
  playlists: PlaylistsState
  connected: boolean
  demo: boolean
  pedalStatus: PedalLinkStatus
  pedalError: string | null
  user: User | null
  syncStatus: SyncStatus
  onSignIn: () => void
  onSignOut: () => void
  onLibraryChange: (entries: LibraryEntry[]) => void
  onOpenSettings: () => void
  onLeave: () => void
}

/**
 * Shell do app: navegação à esquerda, barra de ações em cima e a seção
 * escolhida no meio — o mesmo arranjo do pedal físico na tela do Editor.
 */
export function EditorScreen({
  profile,
  presetsState,
  apiKey,
  guitar,
  library,
  playlists,
  connected,
  demo,
  pedalStatus,
  pedalError,
  user,
  syncStatus,
  onSignIn,
  onSignOut,
  onLibraryChange,
  onOpenSettings,
  onLeave,
}: EditorScreenProps) {
  const [section, setSection] = useState<Section>('editor')
  const state = presetsState
  const values = state.activePreset
  const selectors = profile.parameters.filter((p) => p.options && !p.hidden)

  const status =
    pedalStatus === 'error'
      ? `Erro: ${pedalError ?? 'falha ao falar com o pedal'}`
      : pedalStatus === 'busy'
        ? 'Falando com o pedal…'
        : state.comparing
          ? 'Tocando o gravado'
          : demo
            ? 'Demo · sem pedal'
            : connected
              ? 'Pronto'
              : 'Offline'

  const statusKind =
    pedalStatus === 'error' ? 'error' : pedalStatus === 'busy' ? 'busy' : 'ok'

  return (
    <div className="flex min-h-[100dvh] flex-col lg:flex-row">
      <Sidebar
        profile={profile}
        section={section}
        onSection={setSection}
        active={state.active}
        onSlot={state.setActive}
        connected={connected}
        demo={demo}
        user={user}
        syncStatus={syncStatus}
        onSignIn={onSignIn}
        onSignOut={onSignOut}
        onSettings={onOpenSettings}
        onLeave={onLeave}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          labels={profile.presetLabels}
          active={state.active}
          dirty={state.dirty}
          canUndo={state.canUndo}
          canRedo={state.canRedo}
          comparing={state.comparing}
          canCompare={state.canCompare}
          status={status}
          statusKind={statusKind}
          onUndo={state.undo}
          onRedo={state.redo}
          onSave={state.persist}
          onCopy={state.copyToSlot}
          onCompare={state.toggleCompare}
        />

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6">
          {section === 'editor' && (
            <div className="mx-auto flex w-full max-w-[900px] flex-col gap-6">
              <h2 className="sr-only">Editor de presets — {profile.name}</h2>

              <div aria-live="polite">
                {state.undoLabel && (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-accent/30 bg-accent/8 px-4 py-2.5">
                    <span className="text-xs text-ink">
                      Preset {state.undoLabel} substituído pelo da IA.
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={state.undo}
                        className="flex h-9 cursor-pointer items-center gap-1.5 rounded-md px-3 text-xs font-medium text-accent transition-colors hover:bg-accent/12"
                      >
                        <ArrowCounterClockwise size={13} weight="bold" />
                        Desfazer
                      </button>
                      <button
                        type="button"
                        onClick={state.dismissUndo}
                        className="h-9 cursor-pointer rounded-md px-3 text-xs text-dim transition-colors hover:text-ink"
                      >
                        Manter
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <PedalPanel
                profile={profile}
                values={values}
                active={state.active}
                onParam={state.setParam}
                onSlot={state.setActive}
              />

              <div className="flex flex-col gap-5 rounded-2xl border border-line bg-panel p-5 sm:p-6">
                <h3 className="text-[11px] font-medium tracking-wide text-dim uppercase">
                  Preamp e gabinete
                </h3>
                {selectors.map((param) => (
                  <SlotSelector
                    key={param.id}
                    param={param}
                    value={values[param.id]}
                    onChange={(v) => state.setParam(param.id, v)}
                  />
                ))}
              </div>

              <p className="text-xs text-faint">
                {connected && !demo
                  ? 'Knobs editam o som na hora; Salvar grava no pedal e persiste.'
                  : 'Modo demo — nenhum pedal conectado. Presets ficam salvos neste navegador.'}
              </p>
            </div>
          )}

          {section === 'ia' && (
            <div className="mx-auto w-full max-w-[560px]">
              <AiPanel
                profile={profile}
                apiKey={apiKey}
                guitar={guitar}
                library={library}
                playlists={playlists}
                onLibraryChange={onLibraryChange}
                onApply={state.applyPreset}
                onOpenSettings={onOpenSettings}
                showPlaylists={false}
              />
            </div>
          )}

          {section === 'biblioteca' && (
            <div className="mx-auto w-full max-w-[560px] rounded-2xl border border-line bg-panel p-5">
              <PlaylistSection
                profile={profile}
                library={library}
                playlists={playlists}
                onApply={state.applyPreset}
              />
            </div>
          )}

          {section === 'dispositivo' && (
            <div className="mx-auto flex w-full max-w-[560px] flex-col gap-4">
              <IrPanel profile={profile} />
              <FactoryReset onRestore={state.restoreFactory} />
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

/** Sobrescreve os três slots — por isso pede confirmação antes. */
function FactoryReset({ onRestore }: { onRestore: () => void }) {
  const [confirming, setConfirming] = useState(false)

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-line bg-panel p-5">
      <h3 className="text-[11px] font-medium tracking-wide text-dim uppercase">
        Restaurar de fábrica
      </h3>
      <p className="text-xs leading-relaxed text-dim">
        Devolve os presets A, B e C aos valores que vieram no aparelho — o dump
        real, lido do próprio pedal.
      </p>

      {confirming ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-danger/40 bg-danger/8 px-3 py-2.5">
          <Warning size={15} weight="bold" className="text-danger" />
          <span className="text-xs text-ink">
            Isto sobrescreve os três presets. Confirma?
          </span>
          <div className="ml-auto flex gap-1">
            <button
              type="button"
              onClick={() => {
                onRestore()
                setConfirming(false)
              }}
              className="h-9 cursor-pointer rounded-md border border-danger/50 px-3 text-xs font-medium text-danger transition-colors hover:bg-danger/12"
            >
              Restaurar
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="h-9 cursor-pointer rounded-md px-3 text-xs text-dim transition-colors hover:text-ink"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="h-10 w-fit cursor-pointer rounded-lg border border-line bg-raised px-4 text-sm text-ink transition-colors hover:border-danger/50"
        >
          Restaurar presets de fábrica
        </button>
      )}
    </section>
  )
}
