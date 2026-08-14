import { useCallback, useMemo, useState } from 'react'
import type { DeviceProfile, PresetValues } from 'profiles'
import { clampValues } from 'profiles'
import { initialPresets, savePresets } from '../lib/storage'

/**
 * Estado dos presets (A/B/C) do perfil ativo, com persistência local.
 * A sincronização com o pedal chega no M2; por enquanto os valores vivem
 * no localStorage (modo demo).
 */
export function usePresets(profile: DeviceProfile) {
  const [presets, setPresets] = useState<PresetValues[]>(() =>
    initialPresets(profile),
  )
  const [active, setActive] = useState(0)
  const [dirty, setDirty] = useState(false)
  // Snapshot anterior a uma aplicação vinda da IA, pra ter volta.
  const [undoable, setUndoable] = useState<{
    presets: PresetValues[]
    label: string
  } | null>(null)

  const activePreset = presets[active]

  const setParam = useCallback(
    (paramId: string, value: number) => {
      setPresets((prev) =>
        prev.map((p, i) =>
          i === active ? clampValues(profile, { ...p, [paramId]: value }) : p,
        ),
      )
      setDirty(true)
    },
    [active, profile],
  )

  /** Escreve um preset gerado num slot específico, sem tocar nos outros. */
  const applyPreset = useCallback(
    (index: number, values: PresetValues) => {
      setPresets((prev) => {
        setUndoable({ presets: prev, label: profile.presetLabels[index] })
        return prev.map((p, i) => (i === index ? clampValues(profile, values) : p))
      })
      setActive(index)
      setDirty(true)
    },
    [profile],
  )

  const undoApply = useCallback(() => {
    setUndoable((prev) => {
      if (prev) setPresets(prev.presets)
      return null
    })
  }, [])

  const dismissUndo = useCallback(() => setUndoable(null), [])

  const persist = useCallback(() => {
    savePresets(profile, presets)
    setDirty(false)
  }, [presets, profile])

  return useMemo(
    () => ({
      presets,
      active,
      activePreset,
      dirty,
      undoLabel: undoable?.label ?? null,
      setActive,
      setParam,
      applyPreset,
      undoApply,
      dismissUndo,
      persist,
    }),
    [
      presets,
      active,
      activePreset,
      dirty,
      undoable,
      setParam,
      applyPreset,
      undoApply,
      dismissUndo,
      persist,
    ],
  )
}

export type PresetsState = ReturnType<typeof usePresets>
