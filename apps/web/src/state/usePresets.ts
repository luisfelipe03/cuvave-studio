import { useCallback, useMemo, useRef, useState } from 'react'
import type { DeviceProfile, PresetValues } from 'profiles'
import {
  clampValues,
  factoryPresets,
  normalizeSections,
  sectionForParam,
} from 'profiles'
import { initialPresets, savePresets } from '../lib/storage'
import {
  canRedo as histCanRedo,
  canUndo as histCanUndo,
  initHistory,
  push,
  redo as histRedo,
  undo as histUndo,
} from '../lib/history'
import type { History } from '../lib/history'

/** Arrasto de knob dispara dezenas de eventos; dentro dessa janela, a
 *  mesma edição continua sendo um único passo de desfazer. */
const COALESCE_MS = 700

/**
 * Estado dos presets (A/B/C) do perfil ativo, com persistência local,
 * histórico de desfazer/refazer e o modo de comparação.
 *
 * `saved` é a última imagem conhecida do que está gravado — vem da leitura
 * do bank do pedal ou do último save. É contra ela que o Comparar alterna.
 */
export function usePresets(profile: DeviceProfile) {
  const [hist, setHist] = useState<History<PresetValues[]>>(() =>
    initHistory(initialPresets(profile)),
  )
  const [active, setActive] = useState(0)
  const [dirty, setDirty] = useState(false)
  const [saved, setSaved] = useState<PresetValues[] | null>(null)
  const [comparing, setComparing] = useState(false)
  // Rótulo do banner "preset substituído pela IA", que oferece a volta.
  const [aiLabel, setAiLabel] = useState<string | null>(null)
  const lastEdit = useRef<{ key: string; at: number } | null>(null)

  const presets = hist.present
  // Enquanto compara, a tela mostra o que está gravado, não o que se editou.
  const shown = comparing && saved ? saved : presets
  const activePreset = shown[active]

  const setParam = useCallback(
    (paramId: string, value: number) => {
      setComparing(false)
      const key = `${active}:${paramId}`
      const now = Date.now()
      const continuing =
        lastEdit.current?.key === key && now - lastEdit.current.at < COALESCE_MS
      lastEdit.current = { key, at: now }

      setHist((h) => {
        const next = h.present.map((p, i) => {
          if (i !== active) return p
          // A flag de seção acompanha o parâmetro na MESMA transação: se
          // fossem duas, o desfazer teria que ser clicado duas vezes — a
          // primeira só revertendo o flag, sem efeito visível.
          const merged: PresetValues = { ...p, [paramId]: value }
          const sec = sectionForParam(paramId, value)
          if (sec) merged[sec.id] = sec.value
          return clampValues(profile, merged)
        })
        return continuing ? { ...h, present: next } : push(h, next)
      })
      setDirty(true)
    },
    [active, profile],
  )

  /** Escreve um preset gerado num slot específico, sem tocar nos outros. */
  const applyPreset = useCallback(
    (index: number, values: PresetValues) => {
      setComparing(false)
      lastEdit.current = null
      setHist((h) =>
        push(
          h,
          h.present.map((p, i) =>
            i === index ? normalizeSections(profile, values) : p,
          ),
        ),
      )
      setAiLabel(profile.presetLabels[index])
      setActive(index)
      setDirty(true)
    },
    [profile],
  )

  /** Copia o preset do slot ativo para outro slot. */
  const copyToSlot = useCallback(
    (to: number) => {
      setComparing(false)
      lastEdit.current = null
      setHist((h) =>
        push(
          h,
          h.present.map((p, i) => (i === to ? { ...h.present[active] } : p)),
        ),
      )
      setDirty(true)
    },
    [active],
  )

  /** Devolve os três slots aos presets de fábrica (dump real do pedal). */
  const restoreFactory = useCallback(() => {
    setComparing(false)
    lastEdit.current = null
    setHist((h) => push(h, factoryPresets(profile)))
    setDirty(true)
  }, [profile])

  /**
   * Desfazer/refazer devolvem os presets que passaram a valer, pra quem
   * chamou poder empurrá-los pro pedal.
   */
  const undo = useCallback((): PresetValues[] | null => {
    if (!histCanUndo(hist)) return null
    const next = histUndo(hist)
    setHist(next)
    setComparing(false)
    setAiLabel(null)
    setDirty(true)
    lastEdit.current = null
    return next.present
  }, [hist])

  const redo = useCallback((): PresetValues[] | null => {
    if (!histCanRedo(hist)) return null
    const next = histRedo(hist)
    setHist(next)
    setComparing(false)
    setDirty(true)
    lastEdit.current = null
    return next.present
  }, [hist])

  const dismissUndo = useCallback(() => setAiLabel(null), [])

  /** Substitui tudo sem criar ponto de desfazer — usado pela sincronização. */
  const replaceAll = useCallback(
    (next: PresetValues[]) => {
      const clamped = next.map((p) => clampValues(profile, p))
      setHist(initHistory(clamped))
      setSaved(clamped)
      setComparing(false)
      lastEdit.current = null
      setDirty(false)
    },
    [profile],
  )

  const persist = useCallback(() => {
    savePresets(profile, presets)
    setSaved(presets)
    setComparing(false)
    setDirty(false)
  }, [presets, profile])

  /**
   * Grava um conjunto explícito de presets no localStorage e limpa o flag
   * de "alterações não salvas" — usado quando o save foi feito pelo pedal
   * (o App conhece os valores que gravou, não precisa do estado atual).
   */
  const commitLocal = useCallback(
    (next: PresetValues[]) => {
      savePresets(profile, next)
      setSaved(next)
      setComparing(false)
      setDirty(false)
    },
    [profile],
  )

  /**
   * Liga/desliga a comparação com o que está gravado. Devolve os presets
   * que devem estar tocando agora, pra quem chamou mandar pro pedal.
   */
  const toggleCompare = useCallback((): PresetValues[] | null => {
    if (!saved) return null
    const next = !comparing
    setComparing(next)
    return next ? saved : presets
  }, [comparing, saved, presets])

  return useMemo(
    () => ({
      presets,
      active,
      activePreset,
      dirty,
      comparing,
      canCompare: saved !== null,
      canUndo: histCanUndo(hist),
      canRedo: histCanRedo(hist),
      undoLabel: aiLabel,
      setActive,
      setParam,
      applyPreset,
      copyToSlot,
      restoreFactory,
      undo,
      redo,
      toggleCompare,
      dismissUndo,
      replaceAll,
      persist,
      commitLocal,
    }),
    [
      presets,
      active,
      activePreset,
      dirty,
      comparing,
      saved,
      hist,
      aiLabel,
      setParam,
      applyPreset,
      copyToSlot,
      restoreFactory,
      undo,
      redo,
      toggleCompare,
      dismissUndo,
      replaceAll,
      persist,
      commitLocal,
    ],
  )
}

export type PresetsState = ReturnType<typeof usePresets>
