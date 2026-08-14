import type { DeviceProfile, PresetValues } from 'profiles'
import type { LibraryEntry } from '../lib/storage'
import type { PresetsState } from '../state/usePresets'
import type { AiAccessState } from '../state/useAiAccess'
import type { User } from '../lib/firebase'
import { PresetEditor } from './PresetEditor'
import { IrPanel } from './IrPanel'
import { AiPanel } from './AiPanel'

interface EditorScreenProps {
  profile: DeviceProfile
  presetsState: PresetsState
  apiKey: string
  guitar: string
  library: LibraryEntry[]
  user: User | null
  aiAccess: AiAccessState
  onLibraryChange: (entries: LibraryEntry[]) => void
  onSignIn: () => void
  onOpenSettings: () => void
}

/**
 * Painel de controle numa tela só — reflete o pedal físico, onde todos os
 * knobs e seletores ficam visíveis ao mesmo tempo, sem menus.
 *
 * A coluna auxiliar (IR + IA) cresce muito mais que o editor, então ela
 * rola por dentro em vez de esticar a página: sem isso, usar a IA obrigava
 * a descer a tela inteira deixando metade da janela vazia.
 */
export function EditorScreen({
  profile,
  presetsState,
  apiKey,
  guitar,
  library,
  user,
  aiAccess,
  onLibraryChange,
  onSignIn,
  onOpenSettings,
}: EditorScreenProps) {
  const onApplyAiPreset = (slot: number, values: PresetValues) => {
    presetsState.applyPreset(slot, values)
  }

  return (
    <div className="mx-auto grid w-full max-w-[1400px] grid-cols-1 gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_360px]">
      <main className="min-w-0">
        <PresetEditor profile={profile} state={presetsState} />
      </main>

      <aside className="scroll-thin flex flex-col gap-4 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6.5rem)] lg:overflow-y-auto lg:pr-1">
        <IrPanel profile={profile} />
        <AiPanel
          profile={profile}
          apiKey={apiKey}
          guitar={guitar}
          library={library}
          user={user}
          aiAccess={aiAccess}
          onLibraryChange={onLibraryChange}
          onApply={onApplyAiPreset}
          onSignIn={onSignIn}
          onOpenSettings={onOpenSettings}
        />
      </aside>
    </div>
  )
}
