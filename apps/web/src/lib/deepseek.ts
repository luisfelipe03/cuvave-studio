import { clampValues, defaultPresetValues } from 'profiles'
import type { DeviceProfile, PresetValues } from 'profiles'

/**
 * Cliente da DeepSeek chamado direto do browser.
 *
 * A DeepSeek libera CORS (`access-control-allow-origin` ecoa o origin, com
 * `POST` + `authorization`), então não existe proxy nem backend: a key é do
 * próprio usuário e fica só no navegador dele. Ver cuvave-spec.md.
 */
const CHAT_ENDPOINT = 'https://api.deepseek.com/chat/completions'
const MODELS_ENDPOINT = 'https://api.deepseek.com/models'
const MODEL = 'deepseek-chat'
const TIMEOUT_MS = 90_000

export type DeepSeekErrorCode =
  | 'no-key'
  | 'invalid-key'
  | 'no-credit'
  | 'rate-limit'
  | 'server'
  | 'network'
  | 'timeout'
  | 'bad-response'

/** Erro com causa identificada e caminho de recuperação na mensagem. */
export class DeepSeekError extends Error {
  readonly code: DeepSeekErrorCode

  constructor(code: DeepSeekErrorCode, message: string) {
    super(message)
    this.name = 'DeepSeekError'
    this.code = code
  }

  /** Erros que o usuário resolve na tela de configurações. */
  get isKeyProblem() {
    return this.code === 'no-key' || this.code === 'invalid-key'
  }
}

function errorForStatus(status: number): DeepSeekError {
  if (status === 401)
    return new DeepSeekError(
      'invalid-key',
      'Chave recusada pela DeepSeek. Confira se copiou a chave inteira em platform.deepseek.com.',
    )
  if (status === 402)
    return new DeepSeekError(
      'no-credit',
      'A conta DeepSeek está sem saldo. Adicione créditos para gerar presets.',
    )
  if (status === 429)
    return new DeepSeekError(
      'rate-limit',
      'Muitas requisições seguidas. Espere alguns segundos e tente de novo.',
    )
  if (status >= 500)
    return new DeepSeekError(
      'server',
      'A DeepSeek está indisponível agora. Tente de novo em instantes.',
    )
  return new DeepSeekError(
    'server',
    `A DeepSeek recusou a requisição (HTTP ${status}). Tente de novo.`,
  )
}

/** Confere se a chave é aceita — usa GET /models, que não consome tokens. */
export async function validateKey(apiKey: string): Promise<void> {
  const key = apiKey.trim()
  if (!key)
    throw new DeepSeekError('no-key', 'Cole a sua chave da DeepSeek primeiro.')

  let res: Response
  try {
    res = await fetch(MODELS_ENDPOINT, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15_000),
    })
  } catch (err) {
    throw new DeepSeekError(
      err instanceof Error && err.name === 'TimeoutError' ? 'timeout' : 'network',
      'Não deu pra falar com a DeepSeek. Verifique sua conexão.',
    )
  }
  if (!res.ok) throw errorForStatus(res.status)
}

export function buildSystemPrompt(profile: DeviceProfile): string {
  const params = profile.parameters
    .map((p) => {
      if (p.options) {
        const opts = p.options.map((o) => `${o.value}="${o.label}"`).join(', ')
        return `- ${p.id} (${p.label}): inteiro de ${p.min} a ${p.max}. Opções: ${opts}.`
      }
      const zones = p.zones
        ? ` Zonas: ${p.zones.map((z) => `${z.label}=${z.min}-${z.max}`).join(', ')}.`
        : ''
      return `- ${p.id} (${p.label}): inteiro de ${p.min} a ${p.max}.${zones}`
    })
    .join('\n')

  return [
    `Você é um guitarrista experiente montando presets na pedaleira ${profile.name} (Cuvave/M-VAVE).`,
    ``,
    `Cadeia de efeitos (fixa): Tuner → Preamp → Phaser/Chorus → Delay → Reverb → IR CAB.`,
    `A pedaleira tem ${profile.presetCount} presets: ${profile.presetLabels.join(', ')}.`,
    ``,
    `Parâmetros de cada preset — use SOMENTE inteiros dentro dos limites:`,
    params,
    ``,
    `Semântica de desligado (importante):`,
    `- mix=0 desliga o delay`,
    `- reverb=0 desliga o reverb`,
    `- mod entre 7 e 8 desliga a modulação (0-6 = chorus, 9-15 = phaser)`,
    `- ir_cab=0 desliga o simulador de gabinete`,
    ``,
    `Os três presets devem funcionar como um conjunto para tocar a música do início ao fim`,
    `(por exemplo: base/ritmo, solo com mais ganho e delay, e um limpo para partes suaves).`,
    ``,
    `Responda SOMENTE com JSON válido, sem markdown, neste formato:`,
    `{"presets":{"a":{...},"b":{...},"c":{...}},"names":{"a":"...","b":"...","c":"..."},"explanation":"..."}`,
    ``,
    `- "presets": todos os parâmetros listados acima, em cada um dos três.`,
    `- "names": rótulo curto (1-3 palavras) do papel de cada preset na música.`,
    `- "explanation": em português do Brasil, explique as escolhas citando os valores`,
    `  concretos e o porquê para ESTA música. Seja específico, sem encher linguiça.`,
  ].join('\n')
}

export interface GeneratedPresets {
  presets: PresetValues[]
  names: string[]
  explanation: string
  usage?: { prompt: number; completion: number; total: number }
}

interface ChatResponse {
  choices?: { message?: { content?: string } }[]
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}

/** Remove cercas markdown caso o modelo devolva ```json ... ``` mesmo assim. */
function stripFences(text: string): string {
  const trimmed = text.trim()
  if (!trimmed.startsWith('```')) return trimmed
  return trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim()
}

export async function generatePresets(opts: {
  apiKey: string
  profile: DeviceProfile
  song: string
  hint?: string
  signal?: AbortSignal
}): Promise<GeneratedPresets> {
  const { apiKey, profile, song, hint, signal } = opts
  const key = apiKey.trim()
  if (!key)
    throw new DeepSeekError(
      'no-key',
      'Configure a sua chave da DeepSeek para usar a IA.',
    )

  const timeout = AbortSignal.timeout(TIMEOUT_MS)
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout

  let res: Response
  try {
    res = await fetch(CHAT_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      signal: combined,
      body: JSON.stringify({
        model: MODEL,
        response_format: { type: 'json_object' },
        temperature: 1.0,
        messages: [
          { role: 'system', content: buildSystemPrompt(profile) },
          {
            role: 'user',
            content: `Monte os ${profile.presetCount} presets para tocar "${song}".${
              hint ? ` Contexto extra do guitarrista: ${hint}` : ''
            }`,
          },
        ],
      }),
    })
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError')
      throw new DeepSeekError(
        'timeout',
        'A geração passou de 90 segundos e foi cancelada. Tente de novo.',
      )
    if (err instanceof Error && err.name === 'AbortError')
      throw new DeepSeekError('timeout', 'Geração cancelada.')
    throw new DeepSeekError(
      'network',
      'Não deu pra falar com a DeepSeek. Verifique sua conexão.',
    )
  }

  if (!res.ok) throw errorForStatus(res.status)

  const data = (await res.json().catch(() => null)) as ChatResponse | null
  const content = data?.choices?.[0]?.message?.content
  if (!content)
    throw new DeepSeekError(
      'bad-response',
      'A DeepSeek respondeu vazio. Tente gerar de novo.',
    )

  let parsed: {
    presets?: Record<string, PresetValues>
    names?: Record<string, string>
    explanation?: string
  }
  try {
    parsed = JSON.parse(stripFences(content))
  } catch {
    throw new DeepSeekError(
      'bad-response',
      'A IA respondeu num formato inesperado. Tente gerar de novo.',
    )
  }

  if (!parsed.presets || typeof parsed.presets !== 'object')
    throw new DeepSeekError(
      'bad-response',
      'A resposta da IA veio sem os presets. Tente gerar de novo.',
    )

  // Toda saída da IA passa por clamp contra o schema do profile antes de
  // virar estado do app — valor fora de range nunca chega ao pedal.
  const fallback = defaultPresetValues(profile)
  const keys = profile.presetLabels.map((l) => l.toLowerCase())
  const presets = keys.map((k) =>
    clampValues(profile, { ...fallback, ...(parsed.presets?.[k] ?? {}) }),
  )
  const names = keys.map((k, i) => {
    const raw = parsed.names?.[k]
    return typeof raw === 'string' && raw.trim()
      ? raw.trim().slice(0, 28)
      : `Preset ${profile.presetLabels[i]}`
  })

  return {
    presets,
    names,
    explanation:
      typeof parsed.explanation === 'string' ? parsed.explanation : '',
    usage: data?.usage
      ? {
          prompt: data.usage.prompt_tokens ?? 0,
          completion: data.usage.completion_tokens ?? 0,
          total: data.usage.total_tokens ?? 0,
        }
      : undefined,
  }
}
