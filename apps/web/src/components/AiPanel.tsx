import { useRef, useState } from 'react'
import {
  ArrowClockwise,
  Guitar,
  Key,
  Sparkle,
  Trash,
  WarningCircle,
} from '@phosphor-icons/react'
import type { DeviceProfile, PresetValues } from 'profiles'
import { DeepSeekError, generatePreset } from '../lib/deepseek'
import type { GeneratedPreset } from '../lib/deepseek'
import { loadLibrary, saveLibrary } from '../lib/storage'
import type { LibraryEntry } from '../lib/storage'

interface AiPanelProps {
  profile: DeviceProfile
  apiKey: string
  guitar: string
  onApply: (slot: number, values: PresetValues) => void
  onOpenSettings: () => void
}

type AiState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'done'; result: GeneratedPreset }
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
  onApply,
  onOpenSettings,
}: AiPanelProps) {
  const [song, setSong] = useState('')
  const [hint, setHint] = useState('')
  const [state, setState] = useState<AiState>({ kind: 'idle' })
  const [library, setLibrary] = useState<LibraryEntry[]>(() =>
    loadLibrary(profile),
  )
  const abortRef = useRef<AbortController | null>(null)

  const loading = state.kind === 'loading'

  const updateLibrary = (next: LibraryEntry[]) => {
    setLibrary(next)
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
        song: song.trim(),
        hint: hint.trim() || undefined,
        guitar: guitar.trim() || undefined,
        signal: controller.signal,
      })
      setState({ kind: 'done', result })
      updateLibrary([
        {
          id: crypto.randomUUID(),
          song: result.song,
          name: result.name,
          pickup: result.pickup,
          explanation: result.explanation,
          values: result.values,
          createdAt: new Date().toISOString(),
        },
        ...library,
      ])
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
      className="flex flex-col gap-5 rounded-2xl border border-line bg-panel p-6"
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

      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-2">
          <span className="text-xs font-medium text-dim">
            Música <span aria-hidden="true">*</span>
            <span className="sr-only">(obrigatório)</span>
          </span>
          <input
            type="text"
            required
            value={song}
            onChange={(e) => setSong(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && generate()}
            placeholder="Do I Wanna Know?"
            className="h-11 rounded-lg border border-line-strong bg-bg px-3.5 text-sm text-ink transition-colors placeholder:text-faint focus:border-accent"
          />
        </label>
        <label className="flex flex-col gap-2">
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

      <div aria-live="polite" className="contents">
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

        {state.kind === 'done' && (
          <div className="flex flex-col gap-4 border-t border-line pt-5">
            <div>
              <p className="text-sm font-medium text-ink">{state.result.name}</p>
              <p className="text-xs text-dim">{state.result.song}</p>
            </div>

            {state.result.pickup && (
              <p className="flex items-center gap-1.5 text-xs text-accent">
                <Guitar size={14} weight="bold" />
                Captador: {state.result.pickup}
              </p>
            )}

            {(() => {
              const { named, chips } = summarize(profile, state.result.values)
              return (
                <div className="rounded-lg border border-line bg-bg/60 p-3">
                  <p className="text-[11px] leading-relaxed text-dim">
                    {named.join(' · ')}
                  </p>
                  <p className="tabular mt-1 font-mono text-[10px] leading-relaxed text-faint">
                    {chips.join(' · ')}
                  </p>
                </div>
              )
            })()}

            {state.result.explanation && (
              <p className="text-sm leading-relaxed text-dim">
                {state.result.explanation}
              </p>
            )}

            <div className="flex items-center gap-2">
              <span className="text-xs text-dim">Gravar em</span>
              {profile.presetLabels.map((label, i) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => onApply(i, state.result.values)}
                  aria-label={`Gravar no preset ${label}`}
                  className="h-11 flex-1 cursor-pointer rounded-lg border border-accent/50 bg-accent/12 font-mono text-sm font-semibold text-accent transition-colors hover:bg-accent/25"
                >
                  {label}
                </button>
              ))}
            </div>

            {state.result.usage && (
              <p className="tabular text-center font-mono text-[10px] text-faint">
                {state.result.usage.total.toLocaleString('pt-BR')} tokens
                consumidos
              </p>
            )}
          </div>
        )}
      </div>

      {library.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-line pt-5">
          <h3 className="text-[11px] font-medium tracking-wide text-dim uppercase">
            Gerados ({library.length})
          </h3>
          <p className="text-xs leading-relaxed text-faint">
            O pedal tem só {profile.presetCount} slots — escolha quais entram.
          </p>
          <ul className="mt-1 flex flex-col gap-1.5">
            {library.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-col gap-2 rounded-lg border border-line bg-bg/40 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-ink">
                      {entry.song}
                    </p>
                    <p className="truncate text-[11px] text-dim">
                      {entry.name}
                      {entry.pickup && ` · captador ${entry.pickup}`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      updateLibrary(library.filter((e) => e.id !== entry.id))
                    }
                    aria-label={`Remover preset de ${entry.song}`}
                    className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-md text-faint transition-colors hover:bg-raised hover:text-danger"
                  >
                    <Trash size={13} />
                  </button>
                </div>
                <div className="flex gap-1.5">
                  {profile.presetLabels.map((label, i) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => onApply(i, entry.values)}
                      aria-label={`Gravar ${entry.song} no preset ${label}`}
                      className="h-9 flex-1 cursor-pointer rounded-md border border-line font-mono text-xs text-dim transition-colors hover:border-accent/50 hover:text-accent"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
