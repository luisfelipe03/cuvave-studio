import type { DeviceProfile, PresetValues } from 'profiles'
import type { PresetsState } from '../state/usePresets'
import { PresetEditor } from './PresetEditor'
import { IrPanel } from './IrPanel'
import { AiPanel } from './AiPanel'

interface EditorScreenProps {
  profile: DeviceProfile
  presetsState: PresetsState
  apiKey: string
  guitar: string
  onOpenSettings: () => void
}

/**
 * Painel de controle numa tela só — reflete o pedal físico, onde todos os
 * knobs e seletores ficam visíveis ao mesmo tempo, sem menus. IR e IA ficam
 * como painéis auxiliares ao lado (abaixo em telas estreitas).
 */
export function EditorScreen({
  profile,
  presetsState,
  apiKey,
  guitar,
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

      <aside className="flex flex-col gap-6 lg:sticky lg:top-20 lg:h-fit">
        <IrPanel profile={profile} />
        <AiPanel
          profile={profile}
          apiKey={apiKey}
          guitar={guitar}
          onApply={onApplyAiPreset}
          onOpenSettings={onOpenSettings}
        />
      </aside>
    </div>
  )
}
