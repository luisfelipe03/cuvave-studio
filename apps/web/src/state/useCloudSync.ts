import { useCallback, useEffect, useRef, useState } from 'react'
import type { DeviceProfile } from 'profiles'
import {
  mergeCloud,
  pullCloud,
  pushCloud,
  signInWithGoogle,
  signOutUser,
  wasSignedIn,
  watchAuth,
} from '../lib/firebase'
import type { User } from '../lib/firebase'
import {
  localUpdatedAt,
  saveGuitar,
  saveLibrary,
  savePresets,
} from '../lib/storage'
import type { LibraryEntry } from '../lib/storage'
import type { PresetsState } from './usePresets'

export type SyncStatus = 'signed-out' | 'merging' | 'synced' | 'error'

const PUSH_DEBOUNCE_MS = 2500

interface Options {
  profile: DeviceProfile
  presetsState: PresetsState
  library: LibraryEntry[]
  setLibrary: (entries: LibraryEntry[]) => void
  guitar: string
  setGuitar: (guitar: string) => void
}

/**
 * Sincronização opcional com o Firestore.
 *
 * O app funciona inteiro sem login (localStorage). Ao entrar, o que existe
 * na nuvem é mesclado com o que existe na máquina — sem descartar nenhum
 * lado — e daí em diante as mudanças sobem com debounce.
 */
export function useCloudSync({
  profile,
  presetsState,
  library,
  setLibrary,
  guitar,
  setGuitar,
}: Options) {
  const [user, setUser] = useState<User | null>(null)
  const [status, setStatus] = useState<SyncStatus>('signed-out')
  // Só liga o observador (e baixa o SDK) para quem já entrou antes ou acabou
  // de clicar em entrar — quem nunca usa a nuvem não paga o download.
  const [connected, setConnected] = useState(() => wasSignedIn())
  // Só começa a empurrar depois que a mesclagem inicial terminou, senão o
  // primeiro render sobrescreveria a nuvem com o estado local vazio.
  const readyRef = useRef(false)

  useEffect(() => {
    if (!connected) return
    return watchAuth(setUser)
  }, [connected])

  const { presets, replaceAll } = presetsState

  useEffect(() => {
    if (!user) {
      readyRef.current = false
      setStatus('signed-out')
      return
    }

    let cancelled = false
    setStatus('merging')
    ;(async () => {
      try {
        const cloud = await pullCloud(user.uid)
        if (cancelled) return

        const merged = mergeCloud(
          cloud,
          { presets: { [profile.id]: presets }, library, guitar },
          localUpdatedAt(),
        )

        const mergedPresets = merged.presets[profile.id]
        if (mergedPresets?.length === profile.presetCount) {
          replaceAll(mergedPresets)
          savePresets(profile, mergedPresets)
        }
        setLibrary(merged.library)
        saveLibrary(merged.library)
        if (merged.guitar !== guitar) {
          setGuitar(merged.guitar)
          saveGuitar(merged.guitar)
        }

        await pushCloud(user.uid, merged)
        if (cancelled) return
        readyRef.current = true
        setStatus('synced')
      } catch {
        if (!cancelled) setStatus('error')
      }
    })()

    return () => {
      cancelled = true
    }
    // Roda uma vez por sessão de login: as dependências de dados são lidas
    // no momento da mesclagem de propósito, não devem reagendá-la.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, profile])

  // Sobe mudanças locais com debounce — agrupa rajadas (mexer num knob) numa
  // escrita só, o que mantém o uso bem dentro da cota gratuita.
  useEffect(() => {
    if (!user || !readyRef.current) return
    const id = setTimeout(() => {
      pushCloud(user.uid, {
        presets: { [profile.id]: presets },
        library,
        guitar,
        updatedAt: Date.now(),
      })
        .then(() => setStatus('synced'))
        .catch(() => setStatus('error'))
    }, PUSH_DEBOUNCE_MS)
    return () => clearTimeout(id)
  }, [user, profile, presets, library, guitar])

  const signIn = useCallback(async () => {
    setConnected(true)
    try {
      await signInWithGoogle()
    } catch {
      setStatus('error')
    }
  }, [])

  const signOutAndStop = useCallback(async () => {
    readyRef.current = false
    await signOutUser()
  }, [])

  return { user, status, signIn, signOut: signOutAndStop }
}
