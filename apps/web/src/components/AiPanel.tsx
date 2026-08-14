import { useEffect, useRef, useState } from 'react'
import {
  ArrowClockwise,
  CaretDown,
  CheckCircle,
  Guitar,
  Key,
  MagnifyingGlass,
  Sparkle,
  Trash,
  WarningCircle,
} from '@phosphor-icons/react'
import type { DeviceProfile, PresetValues } from 'profiles'
import { DeepSeekError, generatePreset } from '../lib/deepseek'
import { searchSongs } from '../lib/songSearch'
import type { SongSuggestion } from '../lib/songSearch'
import { saveLibrary } from '../lib/storage'
import type { LibraryEntry } from '../lib/storage'

interface AiPanelProps {
  profile: DeviceProfile
  apiKey: string
  guitar: string
  library: LibraryEntry[]
  onLibraryChange: (entries: LibraryEntry[]) => void
  onApply: (slot: number, values: PresetValues) => void
  onOpenSettings: () => void
}

type AiState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string; keyProblem: boolean }

/** Resumo legível: nome das opções + valores contínuos. */
function summarize(profile: DeviceProfile, values: PresetValues) {
  const named = profile.parameters
    .filter((p) => p.options)
    .map((p) => p.options?.find((o) => o.value === values[p.id])?.label)
    .filter((l): l is string => Boolean(l))

  const chips = profile.parameters
    .filter((p) => !p.options)
    .map((p) => {
      const v = values[p.id]
      const zone = p.zones?.find((z) => v >= z.min && v <= z.max)
      const label = p.label.toLowerCase()
      return zone && zone.label.toLowerCase() === 'off'
        ? `${label} off`
        : `${label} ${v}`
    })

  return { named, chips }
}

export function AiPanel({
  profile,
  apiKey,
  guitar,
  library,
  onLibraryChange,
  onApply,
  onOpenSettings,
}: AiPanelProps) {
  const [song, setSong] = useState('')
  const [hint, setHint] = useState('')
  const [state, setState] = useState<AiState>({ kind: 'idle' })
  // Um preset por vez fica aberto — o recém-gerado abre sozinho. Sem isso a
  // lista viraria uma parede de texto conforme a coleção cresce.
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Autocompletar de música — corrige erro de digitação antes de gastar
  // tokens ("like a stona" → "Like a Stone (Audioslave)").
  const [suggestions, setSuggestions] = useState<SongSuggestion[]>([])
  const [suggestOpen, setSuggestOpen] = useState(false)
  const [suggestIndex, setSuggestIndex] = useState(0)
  // Artista confirmado ao escolher uma sugestão; entra no prompt da IA.
  const [pickedArtist, setPickedArtist] = useState<string | null>(null)

  useEffect(() => {
    const q = song.trim()
    if (q.length < 3) {
      setSuggestions([])
      setSuggestOpen(false)
      return
    }
    const controller = new AbortController()
    const id = setTimeout(async () => {
      try {
        const results = await searchSongs(q, controller.signal)
        if (controller.signal.aborted) return
        setSuggestions(results)
        setSuggestIndex(0)
        setSuggestOpen(true)
      } catch {
        // API fora do ar: silencia o autocompletar, geração segue normal.
        if (!controller.signal.aborted) {
          setSuggestions([])
          setSuggestOpen(false)
        }
      }
    }, 250)
    return () => {
      clearTimeout(id)
      controller.abort()
    }
  }, [song])

  const pickSuggestion = (s: SongSuggestion) => {
    setSong(s.title)
    setPickedArtist(s.artist === '—' ? null : s.artist)
    setSuggestOpen(false)
  }

  const loading = state.kind === 'loading'

  const updateLibrary = (next: LibraryEntry[]) => {
    onLibraryChange(next)
    saveLibrary(next)
  }

  const generate = async () => {
    if (!song.trim() || loading) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setState({ kind: 'loading' })
    try {
      const result = await generatePreset({
        apiKey,
        profile,
        song: pickedArtist ? `${song.trim()} (${pickedArtist})` : song.trim(),
        hint: hint.trim() || undefined,
        guitar: guitar.trim() || undefined,
        signal: controller.signal,
      })
      const entry: LibraryEntry = {
        id: crypto.randomUUID(),
        song: result.song,
        name: result.name,
        pickup: result.pickup,
        explanation: result.explanation,
        values: result.values,
        createdAt: new Date().toISOString(),
        tokens: result.usage?.total,
      }
      updateLibrary([entry, ...library])
      setExpandedId(entry.id)
      setState({ kind: 'idle' })
    } catch (err) {
      const known = err instanceof DeepSeekError
      setState({
        kind: 'error',
        message: known
          ? err.message
          : 'Não deu pra gerar o preset. Tente de novo.',
        keyProblem: known && err.isKeyProblem,
      })
    }
  }

  return (
    <section
      aria-labelledby="ai-heading"
      className="flex flex-col gap-5 rounded-2xl border border-line bg-panel p-5"
    >
      <div className="flex items-center gap-2">
        <Sparkle size={18} weight="bold" className="text-accent" />
        <h2
          id="ai-heading"
          className="text-sm font-semibold tracking-wide uppercase"
        >
          Gerar preset com IA
        </h2>
      </div>

      {!apiKey && (
        <div className="flex flex-col items-start gap-2 rounded-lg border border-line bg-bg/60 p-3">
          <p className="text-xs leading-relaxed text-dim">
            A geração usa a sua chave da DeepSeek — ela fica só neste navegador.
          </p>
          <button
            type="button"
            onClick={onOpenSettings}
            className="flex h-9 cursor-pointer items-center gap-1.5 rounded-md text-xs font-medium text-accent transition-colors hover:underline"
          >
            <Key size={13} weight="bold" />
            Configurar chave
          </button>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="song-input" className="text-xs font-medium text-dim">
            Música <span aria-hidden="true">*</span>
            <span className="sr-only">(obrigatório)</span>
          </label>
          <input
            id="song-input"
            type="text"
            required
            role="combobox"
            aria-expanded={suggestOpen}
            aria-autocomplete="list"
            aria-controls="song-suggestions"
            aria-activedescendant={
              suggestOpen && suggestions[suggestIndex]
                ? `song-suggest-${suggestIndex}`
                : undefined
            }
            value={song}
            onChange={(e) => {
              setSong(e.target.value)
              setPickedArtist(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' && suggestions.length > 0) {
                e.preventDefault()
                setSuggestOpen(true)
                setSuggestIndex((i) => (i + 1) % suggestions.length)
              } else if (e.key === 'ArrowUp' && suggestOpen) {
                e.preventDefault()
                setSuggestIndex(
                  (i) => (i - 1 + suggestions.length) % suggestions.length,
                )
              } else if (e.key === 'Enter') {
                if (suggestOpen && suggestions[suggestIndex]) {
                  e.preventDefault()
                  pickSuggestion(suggestions[suggestIndex])
                } else {
                  generate()
                }
              } else if (e.key === 'Escape') {
                setSuggestOpen(false)
              }
            }}
            onBlur={() => setSuggestOpen(false)}
            placeholder="Do I Wanna Know?"
            className="h-11 rounded-lg border border-line-strong bg-bg px-3.5 text-sm text-ink transition-colors placeholder:text-faint focus:border-accent"
          />

          {pickedArtist && (
            <span className="flex items-center gap-1.5 text-xs text-ok">
              <CheckCircle size={13} weight="fill" />
              {song} — {pickedArtist}
            </span>
          )}

          {suggestOpen && song.trim().length >= 3 && (
            suggestions.length > 0 ? (
              <ul
                id="song-suggestions"
                role="listbox"
                aria-label="Sugestões de música"
                className="flex flex-col gap-0.5 rounded-lg border border-line bg-bg p-1"
              >
                {suggestions.map((s, i) => {
                  const active = i === suggestIndex
                  return (
                    <li
                      key={s.id}
                      id={`song-suggest-${i}`}
                      role="option"
                      aria-selected={active}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        pickSuggestion(s)
                      }}
                      onMouseEnter={() => setSuggestIndex(i)}
                      className={`flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-left ${
                        active ? 'bg-raised' : ''
                      }`}
                    >
                      <MagnifyingGlass
                        size={12}
                        className="shrink-0 text-faint"
                      />
                      <span className="min-w-0 flex-1 truncate text-xs text-ink">
                        {s.title}
                      </span>
                      <span className="max-w-[45%] truncate text-[11px] text-dim">
                        {s.artist}
                      </span>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="flex items-start gap-1.5 rounded-lg border border-line bg-bg p-2.5 text-[11px] leading-relaxed text-dim">
                <WarningCircle size={13} className="mt-0.5 shrink-0 text-accent" />
                Não achei nenhuma música com esse nome — confira a grafia.
                Você ainda pode gerar assim mesmo.
              </p>
            )
          )}
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-dim">
            Parte ou estilo (opcional)
          </span>
          <input
            type="text"
            value={hint}
            onChange={(e) => setHint(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && generate()}
            placeholder="solo, intro limpa, mais pesado…"
            className="h-11 rounded-lg border border-line-strong bg-bg px-3.5 text-sm text-ink transition-colors placeholder:text-faint focus:border-accent"
          />
        </label>
      </div>

      <button
        type="button"
        onClick={generate}
        disabled={!song.trim() || loading}
        className="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-accent px-5 text-sm font-semibold text-accent-ink transition-colors duration-200 hover:bg-accent-strong disabled:opacity-45"
      >
        {loading ? (
          <>
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent-ink/30 border-t-accent-ink" />
            Gerando…
          </>
        ) : (
          <>
            <Sparkle size={16} weight="fill" />
            Gerar preset
          </>
        )}
      </button>

      <div aria-live="polite">
        {state.kind === 'error' && (
          <div
            role="alert"
            className="flex flex-col items-start gap-2 rounded-lg border border-danger/40 bg-danger/8 p-3"
          >
            <p className="flex items-start gap-2 text-sm leading-relaxed text-ink">
              <WarningCircle
                size={16}
                weight="fill"
                className="mt-0.5 shrink-0 text-danger"
              />
              {state.message}
            </p>
            <div className="pl-6">
              {state.keyProblem ? (
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="flex h-9 cursor-pointer items-center gap-1.5 rounded-md text-xs font-medium text-accent transition-colors hover:underline"
                >
                  <Key size={13} weight="bold" />
                  Abrir configurações
                </button>
              ) : (
                <button
                  type="button"
                  onClick={generate}
                  className="flex h-9 cursor-pointer items-center gap-1.5 rounded-md text-xs font-medium text-accent transition-colors hover:underline"
                >
                  <ArrowClockwise size={13} weight="bold" />
                  Tentar de novo
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 border-t border-line pt-4">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-[11px] font-medium tracking-wide text-dim uppercase">
            Presets gerados
          </h3>
          {library.length > 0 && (
            <span className="tabular font-mono text-[10px] text-faint">
              {library.length}
            </span>
          )}
        </div>

        {library.length === 0 ? (
          <p className="text-xs leading-relaxed text-faint">
            Nada gerado ainda. O que você criar fica guardado aqui — o pedal tem
            só {profile.presetCount} slots, então dá pra montar a coleção e
            decidir depois quais entram.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {library.map((entry) => {
              const expanded = expandedId === entry.id
              const { named, chips } = summarize(profile, entry.values)
              return (
                <li
                  key={entry.id}
                  className={`overflow-hidden rounded-lg border bg-bg/40 transition-colors ${
                    expanded ? 'border-accent/40' : 'border-line'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : entry.id)}
                    aria-expanded={expanded}
                    className="flex w-full cursor-pointer items-center gap-2 p-3 text-left"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-ink">
                        {entry.song}
                      </span>
                      <span className="block truncate text-[11px] text-dim">
                        {entry.name}
                        {entry.pickup && ` · captador ${entry.pickup}`}
                      </span>
                    </span>
                    <CaretDown
                      size={12}
                      weight="bold"
                      className={`shrink-0 text-dim transition-transform duration-200 ${
                        expanded ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  {expanded && (
                    <div className="flex flex-col gap-3 px-3 pb-3">
                      {entry.pickup && (
                        <p className="flex items-center gap-1.5 text-xs text-accent">
                          <Guitar size={14} weight="bold" />
                          Captador: {entry.pickup}
                        </p>
                      )}

                      <div className="rounded-md border border-line bg-panel p-2.5">
                        <p className="text-[11px] leading-relaxed text-dim">
                          {named.join(' · ')}
                        </p>
                        <p className="tabular mt-1 font-mono text-[10px] leading-relaxed text-faint">
                          {chips.join(' · ')}
                        </p>
                      </div>

                      {entry.explanation && (
                        <p className="text-xs leading-relaxed text-dim">
                          {entry.explanation}
                        </p>
                      )}

                      <div className="flex items-center gap-2">
                        <span className="text-xs text-dim">Gravar em</span>
                        {profile.presetLabels.map((label, i) => (
                          <button
                            key={label}
                            type="button"
                            onClick={() => onApply(i, entry.values)}
                            aria-label={`Gravar ${entry.song} no preset ${label}`}
                            className="h-11 flex-1 cursor-pointer rounded-lg border border-accent/50 bg-accent/12 font-mono text-sm font-semibold text-accent transition-colors hover:bg-accent/25"
                          >
                            {label}
                          </button>
                        ))}
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        {entry.tokens ? (
                          <span className="tabular font-mono text-[10px] text-faint">
                            {entry.tokens.toLocaleString('pt-BR')} tokens
                          </span>
                        ) : (
                          <span />
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            updateLibrary(
                              library.filter((e) => e.id !== entry.id),
                            )
                            setExpandedId(null)
                          }}
                          className="flex h-9 cursor-pointer items-center gap-1.5 rounded-md px-2 text-[11px] text-faint transition-colors hover:text-danger"
                        >
                          <Trash size={12} />
                          Remover
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
