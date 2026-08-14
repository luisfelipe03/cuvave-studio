import { useCallback, useEffect, useState } from 'react'
import { refreshAiAccess } from '../lib/firebase'
import type { AiAccessInfo } from '../lib/firebase'
import type { User } from '../lib/firebase'

export interface AiAccessState extends AiAccessInfo {
  /** refaz a consulta (usado após pedir acesso ou ser aprovado) */
  refresh: () => Promise<void>
}

const NONE: AiAccessInfo = { isOwner: false, allowed: null, ownerExists: false }

/**
 * Saber se o usuário logado pode usar a chave compartilhada da DeepSeek
 * (dono do projeto ou amigo aprovado). Sem login, retorna vazio — nesse
 * caso só funciona quem tem chave própria no navegador.
 */
export function useAiAccess(user: User | null): AiAccessState {
  const [info, setInfo] = useState<AiAccessInfo>(NONE)

  const refresh = useCallback(async () => {
    if (!user) {
      setInfo(NONE)
      return
    }
    const next = await refreshAiAccess(user)
    setInfo(next)
  }, [user])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { ...info, refresh }
}
