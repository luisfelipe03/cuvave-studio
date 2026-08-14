import { useCallback, useMemo, useState } from 'react'
import { loadPlaylists, savePlaylists } from '../lib/storage'
import type { Playlist } from '../lib/storage'

/**
 * Playlists de presets: listas ordenadas que montam o pedal rápido.
 * Persistem no localStorage; a sincronização com a nuvem (quando logado)
 * passa pelo useCloudSync.
 */
export function usePlaylists() {
  const [playlists, setPlaylists] = useState<Playlist[]>(() =>
    loadPlaylists(),
  )

  const persist = useCallback((next: Playlist[]) => {
    setPlaylists(next)
    savePlaylists(next)
  }, [])

  const create = useCallback(() => {
    const playlist: Playlist = {
      id: crypto.randomUUID(),
      name: `Playlist ${Date.now().toString().slice(-4)}`,
      entryIds: [],
      createdAt: new Date().toISOString(),
    }
    persist([playlist, ...playlists])
    return playlist.id
  }, [persist, playlists])

  const rename = useCallback(
    (id: string, name: string) => {
      persist(
        playlists.map((p) => (p.id === id ? { ...p, name: name.trim() } : p)),
      )
    },
    [persist, playlists],
  )

  const remove = useCallback(
    (id: string) => {
      persist(playlists.filter((p) => p.id !== id))
    },
    [persist, playlists],
  )

  const addEntry = useCallback(
    (id: string, entryId: string) => {
      persist(
        playlists.map((p) =>
          p.id === id && !p.entryIds.includes(entryId)
            ? { ...p, entryIds: [...p.entryIds, entryId] }
            : p,
        ),
      )
    },
    [persist, playlists],
  )

  const removeEntry = useCallback(
    (id: string, entryId: string) => {
      persist(
        playlists.map((p) =>
          p.id === id
            ? { ...p, entryIds: p.entryIds.filter((e) => e !== entryId) }
            : p,
        ),
      )
    },
    [persist, playlists],
  )

  const moveEntry = useCallback(
    (id: string, entryId: string, dir: -1 | 1) => {
      persist(
        playlists.map((p) => {
          if (p.id !== id) return p
          const i = p.entryIds.indexOf(entryId)
          const j = i + dir
          if (i < 0 || j < 0 || j >= p.entryIds.length) return p
          const entryIds = [...p.entryIds]
          ;[entryIds[i], entryIds[j]] = [entryIds[j], entryIds[i]]
          return { ...p, entryIds }
        }),
      )
    },
    [persist, playlists],
  )

  return useMemo(
    () => ({
      playlists,
      setPlaylists: persist,
      create,
      rename,
      remove,
      addEntry,
      removeEntry,
      moveEntry,
    }),
    [playlists, persist, create, rename, remove, addEntry, removeEntry, moveEntry],
  )
}

export type PlaylistsState = ReturnType<typeof usePlaylists>
