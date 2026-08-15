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

export function buildSystemPrompt(
  profile: DeviceProfile,
  guitar?: string,
): string {
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
    `Você é um guitarrista experiente montando UM preset na pedaleira ${profile.name} (Cuvave/M-VAVE).`,
    ``,
    `Cadeia de efeitos (fixa): Tuner → Preamp → Phaser/Chorus → Delay → Reverb → IR CAB.`,
    ``,
    `Parâmetros — use SOMENTE inteiros dentro dos limites indicados. Os nomes de`,
    `preamp e gabinete abaixo são os REAIS desta pedaleira: não invente outros`,
    `nem use nomes parecidos de outras marcas.`,
    params,
    ``,
    `Semântica de desligado (importante):`,
    `- mix=0 desliga o delay`,
    `- reverb=0 desliga o reverb`,
    `- mod entre 7 e 8 desliga a modulação (0-6 = chorus, 9-15 = phaser)`,
    `- ir_cab=0 desliga o simulador de gabinete`,
    ``,
    guitar
      ? `A guitarra é: ${guitar}. Sugira a posição de captador que melhor serve a música nessa guitarra.`
      : `Sugira a posição de captador (braço, meio ou ponte) que melhor serve a música.`,
    ``,
    `Responda SOMENTE com JSON válido, sem markdown, neste formato:`,
    `{"name":"...","pickup":"...","tuning":{"name":"...","notes":["E","A","D","G","B","E"]},"preset":{...},"explanation":"..."}`,
    ``,
    `- "name": rótulo curto (1-3 palavras) do timbre, ex: "Clean chorus", "Blues lead".`,
    `- "pickup": posição do captador em 1-2 palavras, ex: "braço", "ponte".`,
    `- "tuning": a afinação em que a música original é tocada. "name" é o nome`,
    `  comum (ex: "E standard", "Drop D", "Eb standard", "Open G") e "notes" são`,
    `  as 6 notas das cordas, da 6ª (mais grave) até a 1ª (mais aguda), sem`,
    `  oitavas — ex: afinação padrão é ["E","A","D","G","B","E"], Drop D é`,
    `  ["D","A","D","G","B","E"]. Use # pra sustenido (ex: "F#") e b pra bemol.`,
    `- "preset": TODOS os parâmetros listados acima.`,
    `- "explanation": 2-3 frases em português do Brasil, citando os valores concretos`,
    `  e por que servem para ESTA música. Direto ao ponto, sem encher linguiça.`,
  ].join('\n')
}

export interface Tuning {
  /** nome comum, ex: "E standard", "Drop D" */
  name: string
  /** 6 notas, da 6ª corda (grave) até a 1ª (aguda), ex: ["E","A","D","G","B","E"] */
  notes: string[]
}

export const STANDARD_TUNING: Tuning = {
  name: 'E standard',
  notes: ['E', 'A', 'D', 'G', 'B', 'E'],
}

/** Sanitiza a afinação vinda da IA — nunca deixa nota inválida passar. */
function sanitizeTuning(raw: unknown): Tuning {
  if (!raw || typeof raw !== 'object') return STANDARD_TUNING
  const obj = raw as { name?: unknown; notes?: unknown }
  const name =
    typeof obj.name === 'string' && obj.name.trim()
      ? obj.name.trim().slice(0, 24)
      : STANDARD_TUNING.name
  const notes = Array.isArray(obj.notes)
    ? obj.notes
        .map((n) => (typeof n === 'string' ? n.trim().toUpperCase() : ''))
        .filter((n) => /^[A-G](?:#|B)?$/.test(n))
        // Bemol se escreve com "b" minúsculo: sem isso, Eb standard (Guns
        // N' Roses, Hendrix, Van Halen) apareceria como "EB" nas cordas.
        .map((n) => (n.length === 2 && n[1] === 'B' ? `${n[0]}b` : n))
        .slice(0, 6)
    : []
  if (notes.length !== 6) return STANDARD_TUNING
  return { name, notes }
}

export interface GeneratedPreset {
  /** música pedida, guardada junto pra montar a biblioteca */
  song: string
  /** rótulo curto do timbre, ex: "Clean chorus" */
  name: string
  /** posição de captador sugerida, ex: "braço" */
  pickup: string
  /** afinação em que a música é tocada */
  tuning: Tuning
  values: PresetValues
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

export async function generatePreset(opts: {
  apiKey: string
  profile: DeviceProfile
  song: string
  hint?: string
  guitar?: string
  signal?: AbortSignal
}): Promise<GeneratedPreset> {
  const { apiKey, profile, song, hint, guitar, signal } = opts
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
          { role: 'system', content: buildSystemPrompt(profile, guitar) },
          {
            role: 'user',
            content: `Monte um preset para tocar "${song}".${
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
    preset?: PresetValues
    name?: string
    pickup?: string
    tuning?: unknown
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

  if (!parsed.preset || typeof parsed.preset !== 'object')
    throw new DeepSeekError(
      'bad-response',
      'A resposta da IA veio sem o preset. Tente gerar de novo.',
    )

  // Toda saída da IA passa por clamp contra o schema do profile antes de
  // virar estado do app. Isso não é decorativo: modelos erram os nomes e os
  // índices de preamp/gabinete desta pedaleira com frequência, e o clamp
  // garante que só valor válido do profile chegue ao pedal.
  const values = clampValues(profile, {
    ...defaultPresetValues(profile),
    ...parsed.preset,
  })

  const text = (raw: unknown, max: number, fallback: string) =>
    typeof raw === 'string' && raw.trim() ? raw.trim().slice(0, max) : fallback

  return {
    song,
    name: text(parsed.name, 28, 'Preset gerado'),
    pickup: text(parsed.pickup, 16, ''),
    tuning: sanitizeTuning(parsed.tuning),
    values,
    explanation: text(parsed.explanation, 600, ''),
    usage: data?.usage
      ? {
          prompt: data.usage.prompt_tokens ?? 0,
          completion: data.usage.completion_tokens ?? 0,
          total: data.usage.total_tokens ?? 0,
        }
      : undefined,
  }
}
