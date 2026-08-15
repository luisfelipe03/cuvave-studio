/**
 * Busca de músicas pra autocompletar o campo da IA.
 *
 * Principal: Deezer via JSONP — tolerante a erros de digitação ("like a
 * stona" acha "Like a Stone"), mas a API não manda CORS, então a resposta
 * vem por <script> com callback (JSONP), que o browser não bloqueia.
 *
 * Fallback: iTunes Search API (CORS `Access-Control-Allow-Origin: *`).
 *
 * Se as duas falharem, a geração continua funcionando — só o autocompletar
 * some.
 */

export interface SongSuggestion {
  id: string
  title: string
  artist: string
}

const DEEZER_ENDPOINT = 'https://api.deezer.com/search'
const ITUNES_ENDPOINT = 'https://itunes.apple.com/search'
const TIMEOUT_MS = 6000

interface DeezerPayload {
  data?: { id: number; title: string; artist?: { name: string } }[]
}

interface ItunesPayload {
  results?: { trackId: number; trackName: string; artistName: string }[]
}

let jsonpSeq = 0

function deezerJsonp(
  q: string,
  signal?: AbortSignal,
): Promise<SongSuggestion[]> {
  return new Promise((resolve, reject) => {
    const cbName = `__cuvaveSongSearch${jsonpSeq++}`
    const script = document.createElement('script')
    let timer = 0
    let settled = false

    // Nunca apaga o callback de cara: o <script> pode estar em voo e
    // executaria depois do abort (ReferenceError no console). No lugar
    // disso, marca como settled e troca por um no-op, apagando mais tarde.
    const cleanup = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      script.remove()
      ;(window as unknown as Record<string, unknown>)[cbName] = () => {}
      window.setTimeout(() => {
        delete (window as unknown as Record<string, unknown>)[cbName]
      }, 30_000)
    }

    const settle = (fn: () => void) => {
      if (settled) return
      settled = true
      cleanup()
      fn()
    }

    const onAbort = () =>
      settle(() => reject(new DOMException('aborted', 'AbortError')))

    ;(window as unknown as Record<string, unknown>)[cbName] = (raw: unknown) => {
      settle(() => {
        const data = raw as DeezerPayload
        resolve(
          (data.data ?? [])
            .filter((t) => typeof t.title === 'string' && t.title.trim())
            .map((t) => ({
              id: String(t.id),
              title: t.title,
              artist: t.artist?.name || '—',
            })),
        )
      })
    }

    script.onerror = () => settle(() => reject(new Error('Deezer falhou')))
    timer = window.setTimeout(
      () => settle(() => reject(new Error('Deezer timeout'))),
      TIMEOUT_MS,
    )

    if (signal) {
      if (signal.aborted) {
        onAbort()
        return
      }
      signal.addEventListener('abort', onAbort, { once: true })
    }

    script.src = `${DEEZER_ENDPOINT}?q=${encodeURIComponent(q)}&limit=5&output=jsonp&callback=${cbName}`
    document.head.appendChild(script)
  })
}

async function itunesSearch(
  q: string,
  signal?: AbortSignal,
): Promise<SongSuggestion[]> {
  const timeout = AbortSignal.timeout(TIMEOUT_MS)
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout
  const url = `${ITUNES_ENDPOINT}?term=${encodeURIComponent(q)}&media=music&entity=song&limit=5`

  const res = await fetch(url, { signal: combined })
  if (!res.ok) throw new Error(`iTunes respondeu ${res.status}`)

  const data = (await res.json()) as ItunesPayload
  return (data.results ?? [])
    .filter((r) => typeof r.trackName === 'string' && r.trackName.trim())
    .map((r) => ({
      id: String(r.trackId),
      title: r.trackName,
      artist: r.artistName || '—',
    }))
}

export async function searchSongs(
  query: string,
  signal?: AbortSignal,
): Promise<SongSuggestion[]> {
  const q = query.trim()
  if (q.length < 3) return []

  try {
    return await deezerJsonp(q, signal)
  } catch {
    // Deezer fora do ar ou sem JSONP: tenta o iTunes (CORS padrão).
    return await itunesSearch(q, signal)
  }
}
