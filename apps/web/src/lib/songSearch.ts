/**
 * Busca de músicas pra autocompletar o campo da IA.
 *
 * Usa a API pública do Deezer: sem autenticação, CORS liberado e busca
 * tolerante a erros de digitação ("like a stona" acha "Like a Stone").
 * Se a API estiver fora do ar, a geração continua funcionando — só o
 * autocompletar some.
 */

export interface SongSuggestion {
  id: string
  title: string
  artist: string
}

const ENDPOINT = 'https://api.deezer.com/search'
const TIMEOUT_MS = 6000

export async function searchSongs(
  query: string,
  signal?: AbortSignal,
): Promise<SongSuggestion[]> {
  const q = query.trim()
  if (q.length < 3) return []

  const timeout = AbortSignal.timeout(TIMEOUT_MS)
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout
  const url = `${ENDPOINT}?q=${encodeURIComponent(q)}&limit=5`

  const res = await fetch(url, { signal: combined })
  if (!res.ok) throw new Error(`Deezer respondeu ${res.status}`)

  const data = (await res.json()) as {
    data?: { id: number; title: string; artist?: { name: string } }[]
  }

  return (data.data ?? [])
    .filter((t) => typeof t.title === 'string' && t.title.trim())
    .map((t) => ({
      id: String(t.id),
      title: t.title,
      artist: t.artist?.name || '—',
    }))
}
