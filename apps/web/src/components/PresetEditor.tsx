import { FloppyDisk, Repeat } from '@phosphor-icons/react'
import type { PresetsState } from '../state/usePresets'
import type { DeviceProfile } from 'profiles'
import { Knob } from './Knob'
import { SlotSelector } from './SlotSelector'

interface PresetEditorProps {
  profile: DeviceProfile
  state: PresetsState
}

/**
 * Módulos da cadeia e sua condição de "ligado" (semântica do manual).
 * `id` aponta pro parâmetro real do profile que carrega o estado on/off —
 * não é necessariamente o mesmo nome do módulo (ex: delay é lido via `mix`,
 * "MIX no mínimo = delay off").
 */
const CHAIN: { id: string; label: string; isOn: (v: number) => boolean }[] = [
  { id: 'preamp', label: 'Preamp', isOn: () => true },
  { id: 'mod', label: 'Mod', isOn: (v) => v <= 6 || v >= 9 },
  { id: 'mix', label: 'Delay', isOn: (v) => v > 0 },
  { id: 'reverb', label: 'Reverb', isOn: (v) => v > 0 },
  { id: 'ir_cab', label: 'IR Cab', isOn: (v) => v > 0 },
]

export function PresetEditor({ profile, state }: PresetEditorProps) {
  const { activePreset: values, active, dirty } = state
  const knobs = profile.parameters.filter((p) => !p.options)
  const selectors = profile.parameters.filter((p) => p.options)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex gap-1 rounded-xl border border-line bg-panel p-1">
          {profile.presetLabels.map((label, i) => (
            <button
              key={label}
              onClick={() => state.setActive(i)}
              className={`h-9 w-12 rounded-lg font-mono text-sm font-semibold transition-all duration-200 active:scale-[0.96] ${
                i === active
                  ? 'bg-raised text-accent shadow-soft'
                  : 'text-dim hover:text-ink'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {dirty && (
            <span className="flex items-center gap-1.5 text-xs text-dim">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
              alterações não salvas
            </span>
          )}
          <button
            onClick={state.persist}
            disabled={!dirty}
            className="flex h-9 items-center gap-2 rounded-lg border border-line bg-raised px-4 text-sm font-medium text-ink transition-all duration-200 enabled:hover:border-accent/40 enabled:active:scale-[0.97] disabled:opacity-40"
          >
            <FloppyDisk size={15} weight="bold" />
            Salvar
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-line bg-panel px-4 py-2.5">
        <span className="text-[11px] tracking-wide text-faint uppercase">
          Cadeia
        </span>
        {CHAIN.map((mod, i) => {
          const raw = values[mod.id] ?? 0
          const on = mod.isOn(raw)
          return (
            <span key={mod.id} className="flex items-center gap-3">
              {i > 0 && (
                <Repeat size={10} weight="bold" className="text-faint" />
              )}
              <span
                className={`flex items-center gap-1.5 text-xs transition-colors ${
                  on ? 'text-ink' : 'text-faint line-through'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    on ? 'bg-accent' : 'bg-raised'
                  }`}
                />
                {mod.label}
              </span>
            </span>
          )
        })}
      </div>

      <div className="flex flex-wrap gap-x-10 gap-y-6 rounded-2xl border border-line bg-panel p-8">
        {knobs.map((param) => (
          <Knob
            key={param.id}
            param={param}
            value={values[param.id]}
            onChange={(v) => state.setParam(param.id, v)}
          />
        ))}
      </div>

      <div className="flex flex-col gap-4 rounded-2xl border border-line bg-panel p-6">
        {selectors.map((param) => (
          <SlotSelector
            key={param.id}
            param={param}
            value={values[param.id]}
            onChange={(v) => state.setParam(param.id, v)}
          />
        ))}
      </div>
    </div>
  )
}
