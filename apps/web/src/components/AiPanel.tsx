import { useRef, useState } from 'react'
import {
  ArrowClockwise,
  Check,
  Key,
  Sparkle,
  WarningCircle,
} from '@phosphor-icons/react'
import type { DeviceProfile, PresetValues } from 'profiles'
import { DeepSeekError, generatePresets } from '../lib/deepseek'
import type { GeneratedPresets } from '../lib/deepseek'

interface AiPanelProps {
  profile: DeviceProfile
  apiKey: string
  onApply: (presets: PresetValues[]) => void
  onOpenSettings: () => void
}

type AiState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'done'; result: GeneratedPresets; applied: boolean }
  | { kind: 'error'; message: string; keyProblem: boolean }

/** Resumo legível de um preset: nome das opções + valores contínuos. */
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
  onApply,
  onOpenSettings,
}: AiPanelProps) {
  const [song, setSong] = useState('')
  const [hint, setHint] = useState('')
  const [state, setState] = useState<AiState>({ kind: 'idle' })
  const abortRef = useRef<AbortController | null>(null)

  const loading = state.kind === 'loading'

  const generate = async () => {
    if (!song.trim() || loading) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setState({ kind: 'loading' })
    try {
      const result = await generatePresets({
        apiKey,
        profile,
        song: song.trim(),
        hint: hint.trim() || undefined,
        signal: controller.signal,
      })
      setState({ kind: 'done', result, applied: false })
    } catch (err) {
      const known = err instanceof DeepSeekError
      setState({
        kind: 'error',
        message: known
          ? err.message
          : 'Não deu pra gerar os presets. Tente de novo.',
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
            A geração usa a sua chave da DeepSeek — ela fica só neste
            navegador.
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
            Nome da música <span aria-hidden="true">*</span>
            <span className="sr-only">(obrigatório)</span>
          </span>
          <input
            type="text"
            required
            value={song}
            onChange={(e) => setSong(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && generate()}
            placeholder="Sweet Child O' Mine"
            className="h-11 rounded-lg border border-line-strong bg-bg px-3.5 text-sm text-ink transition-colors placeholder:text-faint focus:border-accent"
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-xs font-medium text-dim">
            Dica de estilo (opcional)
          </span>
          <input
            type="text"
            value={hint}
            onChange={(e) => setHint(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && generate()}
            placeholder="mais pesado, menos delay…"
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
            Gerar {profile.presetCount} presets
          </>
        )}
      </button>

      {/* Erros e resultado são anunciados a leitores de tela */}
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
            <div className="flex items-center gap-1 pl-6">
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
            {state.result.explanation && (
              <p className="text-sm leading-relaxed text-dim">
                {state.result.explanation}
              </p>
            )}

            <ul className="flex flex-col gap-2">
              {state.result.presets.map((preset, i) => {
                const { named, chips } = summarize(profile, preset)
                return (
                  <li
                    key={profile.presetLabels[i]}
                    className="rounded-lg border border-line bg-bg/60 p-3"
                  >
                    <div className="flex items-baseline gap-2">
                      <span className="tabular font-mono text-xs font-semibold text-accent">
                        {profile.presetLabels[i]}
                      </span>
                      <span className="truncate text-xs font-medium text-ink">
                        {state.result.names[i]}
                      </span>
                    </div>
                    <p className="mt-1.5 text-[11px] leading-relaxed text-dim">
                      {named.join(' · ')}
                    </p>
                    <p className="tabular mt-1 font-mono text-[10px] leading-relaxed text-faint">
                      {chips.join(' · ')}
                    </p>
                  </li>
                )
              })}
            </ul>

            <button
              type="button"
              onClick={() => {
                onApply(state.result.presets)
                setState({ ...state, applied: true })
              }}
              disabled={state.applied}
              className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-accent/50 bg-accent/12 px-4 text-sm font-medium text-accent transition-colors duration-200 hover:bg-accent/20 disabled:opacity-45"
            >
              {state.applied ? (
                <>
                  <Check size={15} weight="bold" />
                  Aplicado aos presets
                </>
              ) : (
                `Aplicar aos presets ${profile.presetLabels.join('/')}`
              )}
            </button>

            {state.result.usage && (
              <p className="tabular text-center font-mono text-[10px] text-faint">
                {state.result.usage.total.toLocaleString('pt-BR')} tokens
                consumidos
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
