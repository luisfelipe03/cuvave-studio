import { useCallback, useMemo, useState } from 'react'
import type { DeviceProfile, PresetValues } from 'profiles'
import { clampValues } from 'profiles'
import { initialPresets, savePresets } from '../lib/storage'

/**
 * Estado dos 3 presets (A/B/C) do perfil ativo, com persistência local.
 * A sincronização com o pedal chega no M2; por enquanto os valores vivem
 * no localStorage (modo demo).
 */
export function usePresets(profile: DeviceProfile) {
  const [presets, setPresets] = useState<PresetValues[]>(() =>
    initialPresets(profile),
  )
  const [active, setActive] = useState(0)
  const [dirty, setDirty] = useState(false)

  const activePreset = presets[active]

  const setParam = useCallback(
    (paramId: string, value: number) => {
      setPresets((prev) =>
        prev.map((p, i) =>
          i === active
            ? clampValues(profile, { ...p, [paramId]: value })
            : p,
        ),
      )
      setDirty(true)
    },
    [active, profile],
  )

  const applyPresets = useCallback(
    (next: PresetValues[]) => {
      const clamped = next.map((p) => clampValues(profile, p))
      setPresets(clamped)
      setDirty(false)
    },
    [profile],
  )

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
      setActive,
      setParam,
      applyPresets,
      persist,
    }),
    [presets, active, activePreset, dirty, setParam, applyPresets, persist],
  )
}

export type PresetsState = ReturnType<typeof usePresets>
