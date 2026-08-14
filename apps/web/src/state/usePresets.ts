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
  // Snapshot do estado anterior a uma aplicação em lote (IA) — aplicar
  // sobrescreve os três presets de uma vez, então precisa ter volta.
  const [undoable, setUndoable] = useState<PresetValues[] | null>(null)

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

  const applyPresets = useCallback(
    (next: PresetValues[]) => {
      setPresets((prev) => {
        setUndoable(prev)
        return next.map((p) => clampValues(profile, p))
      })
      setDirty(true)
    },
    [profile],
  )

  const undoApply = useCallback(() => {
    setUndoable((prev) => {
      if (prev) setPresets(prev)
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
      canUndo: undoable !== null,
      setActive,
      setParam,
      applyPresets,
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
      applyPresets,
      undoApply,
      dismissUndo,
      persist,
    ],
  )
}

export type PresetsState = ReturnType<typeof usePresets>
