import { ArrowCounterClockwise, CaretRight, FloppyDisk } from '@phosphor-icons/react'
import type { DeviceProfile } from 'profiles'
import type { PresetsState } from '../state/usePresets'
import { Knob } from './Knob'
import { SlotSelector } from './SlotSelector'

interface PresetEditorProps {
  profile: DeviceProfile
  state: PresetsState
}

/**
 * Módulos da cadeia e seu estado de ligado. Os flags de seção são campos
 * reais do bank (confirmado no M1) — são eles que mandam, não os valores:
 * o preset A de fábrica tem mix=0 com delay_section=1.
 */
const CHAIN: { id: string; label: string; isOn: (v: number) => boolean }[] = [
  { id: 'tone_section', label: 'Preamp', isOn: (v) => v > 0 },
  { id: 'mod', label: 'Mod', isOn: (v) => v <= 6 || v >= 9 },
  { id: 'delay_section', label: 'Delay', isOn: (v) => v > 0 },
  { id: 'reverb', label: 'Reverb', isOn: (v) => v > 0 },
  { id: 'ir_section', label: 'IR Cab', isOn: (v) => v > 0 },
]

export function PresetEditor({ profile, state }: PresetEditorProps) {
  const { activePreset: values, active, dirty, undoLabel } = state
  const knobs = profile.parameters.filter((p) => !p.options && !p.hidden)
  const selectors = profile.parameters.filter((p) => p.options && !p.hidden)

  return (
    <div className="flex flex-col gap-5">
      <h1 className="sr-only">Editor de presets — {profile.name}</h1>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="radiogroup"
          aria-label="Preset em edição"
          className="flex gap-1 rounded-xl border border-line bg-panel p-1"
        >
          {profile.presetLabels.map((label, i) => (
            <button
              key={label}
              type="button"
              role="radio"
              aria-checked={i === active}
              aria-label={`Preset ${label}`}
              onClick={() => state.setActive(i)}
              className={`h-11 w-14 cursor-pointer rounded-lg font-mono text-sm font-semibold transition-colors duration-200 ${
                i === active
                  ? 'bg-raised text-accent'
                  : 'text-dim hover:text-ink'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          {dirty && (
            <span className="flex items-center gap-1.5 text-xs text-dim">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              alterações não salvas
            </span>
          )}
          <button
            type="button"
            onClick={state.persist}
            disabled={!dirty}
            className="flex h-11 cursor-pointer items-center gap-2 rounded-lg border border-line bg-raised px-4 text-sm font-medium text-ink transition-colors duration-200 enabled:hover:border-accent/50 disabled:opacity-45"
          >
            <FloppyDisk size={15} weight="bold" />
            Salvar
          </button>
        </div>
      </div>

      {/* Volta atrás depois que um preset da IA sobrescreve um slot */}
      <div aria-live="polite">
        {undoLabel && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-accent/30 bg-accent/8 px-4 py-2.5">
            <span className="text-xs text-ink">
              Preset {undoLabel} substituído pelo da IA.
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={state.undoApply}
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

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-line bg-panel px-4 py-2.5">
        <span className="mr-1 text-[11px] tracking-wide text-faint uppercase">
          Cadeia
        </span>
        {CHAIN.map((mod, i) => {
          const raw = values[mod.id] ?? 0
          const on = mod.isOn(raw)
          return (
            <span key={mod.id} className="flex items-center gap-2">
              {i > 0 && (
                <CaretRight size={9} weight="bold" className="text-faint" />
              )}
              <span
                className={`flex items-center gap-1.5 text-xs ${
                  on ? 'text-ink' : 'text-faint line-through'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`h-1.5 w-1.5 rounded-full ${
                    on ? 'bg-accent' : 'bg-line-strong'
                  }`}
                />
                {mod.label}
                <span className="sr-only">{on ? ' ligado' : ' desligado'}</span>
              </span>
            </span>
          )
        })}
      </div>

      <div className="flex flex-wrap justify-center gap-x-8 gap-y-6 rounded-2xl border border-line bg-panel p-6 sm:justify-start sm:p-8">
        <h2 className="sr-only">Parâmetros contínuos</h2>
        {knobs.map((param) => (
          <Knob
            key={param.id}
            param={param}
            value={values[param.id]}
            onChange={(v) => state.setParam(param.id, v)}
          />
        ))}
      </div>

      <div className="flex flex-col gap-5 rounded-2xl border border-line bg-panel p-5 sm:p-6">
        <h2 className="sr-only">Seleção de gabinete e preamp</h2>
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
