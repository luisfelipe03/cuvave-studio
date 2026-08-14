import { useState } from 'react'
import { Sparkle, WarningCircle } from '@phosphor-icons/react'
import type { DeviceProfile, PresetValues } from 'profiles'
import { clampValues, defaultPresetValues } from 'profiles'

function buildSystemPrompt(profile: DeviceProfile): string {
  const params = profile.parameters
    .map((p) => {
      if (p.options) {
        return `${p.id} (${p.label}): inteiro entre ${p.min} e ${p.max}. Opções: ${p.options.map((o) => `${o.value}="${o.label}"`).join(', ')}.`
      }
      const zones = p.zones
        ? ` Zonas: ${p.zones.map((z) => `${z.label}=${z.min}-${z.max}`).join(', ')}.`
        : ''
      return `${p.id} (${p.label}): inteiro entre ${p.min} e ${p.max}.${zones}`
    })
    .join('\n')

  return [
    `Você gera presets de guitarra para a pedaleira ${profile.name} (Cuvave/M-VAVE).`,
    `A cadeia de efeitos é fixa: Tuner → Preamp → Phaser/Chorus → Delay → Reverb → IR CAB.`,
    `Há ${profile.presetCount} presets: ${profile.presetLabels.join(', ')}.`,
    `Parâmetros de cada preset (use APENAS valores dentro dos limites):`,
    params,
    `Semântica: mix=0 desliga o delay; reverb=0 desliga o reverb; mod entre 7 e 8 desliga o mod (0-6 chorus, 9-15 phaser); ir_cab=0 desliga o IR.`,
    `Responda SOMENTE com JSON válido no formato:`,
    `{"presets":{"a":{...todos os parâmetros...},"b":{...},"c":{...}},"explanation":"..."}`,
    `Os três presets devem formar um conjunto coerente (ex: a=ritmo com drive médio, b=lead com mais gain/delay, c=clean/ambiente).`,
    `A explicação deve citar cada escolha em português, de forma concreta.`,
  ].join('\n')
}

interface AiResponse {
  presets: { a: PresetValues; b: PresetValues; c: PresetValues }
  explanation: string
}

interface AiPanelProps {
  profile: DeviceProfile
  apiKey: string
  onApply: (presets: PresetValues[]) => void
  onOpenSettings: () => void
}

type AiState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'done'; result: AiResponse }
  | { kind: 'error'; message: string }

export function AiPanel({
  profile,
  apiKey,
  onApply,
  onOpenSettings,
}: AiPanelProps) {
  const [song, setSong] = useState('')
  const [hint, setHint] = useState('')
  const [state, setState] = useState<AiState>({ kind: 'idle' })

  const generate = async () => {
    if (!apiKey) {
      setState({
        kind: 'error',
        message: 'Configure sua API key da DeepSeek para usar a IA.',
      })
      return
    }
    setState({ kind: 'loading' })
    try {
      const res = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: buildSystemPrompt(profile) },
            {
              role: 'user',
              content: `Gere 3 presets para a música "${song}".${hint ? ` Contexto extra: ${hint}` : ''}`,
            },
          ],
        }),
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(`API respondeu ${res.status}: ${text.slice(0, 120)}`)
      }
      const data = (await res.json()) as { choices: { message: { content: string } }[] }
      const parsed = JSON.parse(data.choices[0].message.content) as AiResponse
      const fallback = defaultPresetValues(profile)
      const result: AiResponse = {
        presets: {
          a: clampValues(profile, { ...fallback, ...parsed.presets?.a }),
          b: clampValues(profile, { ...fallback, ...parsed.presets?.b }),
          c: clampValues(profile, { ...fallback, ...parsed.presets?.c }),
        },
        explanation: parsed.explanation ?? '',
      }
      setState({ kind: 'done', result })
    } catch (err) {
      setState({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Falha ao gerar presets.',
      })
    }
  }

  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-line bg-panel p-6">
      <div className="flex items-center gap-2">
        <Sparkle size={18} weight="bold" className="text-accent" />
        <h2 className="text-sm font-semibold tracking-wide uppercase">
          Gerar preset com IA
        </h2>
      </div>

      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-2">
          <span className="text-xs font-medium text-dim">
            Nome da música <span className="text-faint">*</span>
          </span>
          <input
            type="text"
            value={song}
            onChange={(e) => setSong(e.target.value)}
            placeholder="Ex: Sweet Child O' Mine, Sober, Wherever I May Roam…"
            className="h-11 rounded-lg border border-line bg-bg px-3.5 text-sm text-ink placeholder:text-faint focus:border-accent/50 focus:outline-none"
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
            placeholder="Ex: tom mais pesado, clean com chorus, vintage…"
            className="h-11 rounded-lg border border-line bg-bg px-3.5 text-sm text-ink placeholder:text-faint focus:border-accent/50 focus:outline-none"
          />
        </label>
      </div>

      {state.kind === 'error' && (
        <div className="flex items-start gap-2 rounded-lg border border-accent/30 bg-accent/5 p-3 text-sm text-ink">
          <WarningCircle size={16} className="mt-0.5 shrink-0 text-accent" />
          <span>
            {state.message}{' '}
            {!apiKey && (
              <button
                onClick={onOpenSettings}
                className="font-medium text-accent underline-offset-2 hover:underline"
              >
                Abrir configurações
              </button>
            )}
          </span>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={generate}
          disabled={!song.trim() || state.kind === 'loading'}
          className="flex h-11 items-center gap-2 rounded-lg bg-accent px-5 text-sm font-semibold text-accent-ink transition-all duration-200 hover:bg-accent-strong active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {state.kind === 'loading' ? (
            <>
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent-ink/30 border-t-accent-ink" />
              Gerando…
            </>
          ) : (
            <>
              <Sparkle size={16} weight="fill" />
              Gerar presets
            </>
          )}
        </button>
        <span className="text-xs text-faint">
          {profile.presetCount} presets ({profile.presetLabels.join('/')}) +
          explicação
        </span>
      </div>

      {state.kind === 'done' && (
        <div className="flex flex-col gap-4 border-t border-line pt-5">
          <p className="text-sm leading-relaxed text-dim">
            {state.result.explanation}
          </p>
          <button
            onClick={() =>
              onApply([
                state.result.presets.a,
                state.result.presets.b,
                state.result.presets.c,
              ])
            }
            className="h-10 self-start rounded-lg border border-accent/40 bg-accent/10 px-4 text-sm font-medium text-accent transition-all duration-200 hover:bg-accent/20 active:scale-[0.97]"
          >
            Aplicar aos presets A/B/C
          </button>
        </div>
      )}
    </div>
  )
}
