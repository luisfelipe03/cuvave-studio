import type { User } from 'firebase/auth'
import type { PresetValues } from 'profiles'
import type { LibraryEntry } from './storage'

/**
 * Config web do Firebase.
 *
 * Isto NÃO é segredo: identifica o projeto e vai no bundle de qualquer jeito.
 * Quem protege os dados são as Security Rules (`firestore.rules`) + o Auth.
 * Um fork com projeto próprio pode sobrescrever por variável de ambiente.
 */
const firebaseConfig = {
  apiKey:
    import.meta.env.VITE_FIREBASE_API_KEY ??
    'AIzaSyC5_m-AZEewBMbmuN1AEAj9ACdTtJZ3Ksw',
  authDomain:
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? 'cuvave-studio.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? 'cuvave-studio',
  messagingSenderId: import.meta.env.VITE_FIREBASE_SENDER_ID ?? '633900820069',
  appId:
    import.meta.env.VITE_FIREBASE_APP_ID ??
    '1:633900820069:web:a84e931adf2cf819ed888c',
}

const SIGNED_IN_KEY = 'cuvave-studio.signed-in'

/**
 * O SDK do Firebase pesa ~550 kB — mais que o resto do app somado. Como o
 * login é opcional, ele só é baixado quando alguém realmente usa a nuvem:
 * ao clicar em entrar, ou ao recarregar já tendo entrado antes.
 */
export function wasSignedIn(): boolean {
  return localStorage.getItem(SIGNED_IN_KEY) === '1'
}

let bundle: Promise<{
  auth: import('firebase/auth').Auth
  db: import('firebase/firestore').Firestore
  authApi: typeof import('firebase/auth')
  dbApi: typeof import('firebase/firestore')
}> | null = null

function load() {
  if (!bundle) {
    bundle = (async () => {
      const [{ initializeApp }, authApi, dbApi] = await Promise.all([
        import('firebase/app'),
        import('firebase/auth'),
        import('firebase/firestore'),
      ])
      const app = initializeApp(firebaseConfig)
      const auth = authApi.getAuth(app)
      // Mantém a sessão entre recargas — senão teria que logar toda vez.
      await authApi.setPersistence(auth, authApi.browserLocalPersistence)
      return { auth, db: dbApi.getFirestore(app), authApi, dbApi }
    })()
  }
  return bundle
}

export type { User }

/** Observa o estado de login. Devolve a função de cancelamento na hora. */
export function watchAuth(cb: (user: User | null) => void): () => void {
  let unsubscribe: (() => void) | null = null
  let cancelled = false
  void load().then(({ auth, authApi }) => {
    if (cancelled) return
    unsubscribe = authApi.onAuthStateChanged(auth, (user) => {
      if (user) localStorage.setItem(SIGNED_IN_KEY, '1')
      else localStorage.removeItem(SIGNED_IN_KEY)
      cb(user)
    })
  })
  return () => {
    cancelled = true
    unsubscribe?.()
  }
}

export async function signInWithGoogle(): Promise<void> {
  const { auth, authApi } = await load()
  await authApi.signInWithPopup(auth, new authApi.GoogleAuthProvider())
  localStorage.setItem(SIGNED_IN_KEY, '1')
}

export async function signOutUser(): Promise<void> {
  const { auth, authApi } = await load()
  localStorage.removeItem(SIGNED_IN_KEY)
  await authApi.signOut(auth)
}

/**
 * Um documento só por usuário, em vez de um documento por preset.
 * O plano gratuito conta leituras por documento (50k/dia), então agrupar
 * mantém a sincronização praticamente de graça: um login = 1 leitura.
 */
export interface CloudData {
  presets: Record<string, PresetValues[]>
  library: LibraryEntry[]
  guitar: string
  updatedAt: number
}

const EMPTY: CloudData = { presets: {}, library: [], guitar: '', updatedAt: 0 }

export async function pullCloud(uid: string): Promise<CloudData> {
  const { db, dbApi } = await load()
  const snap = await dbApi.getDoc(dbApi.doc(db, 'users', uid, 'data', 'studio'))
  if (!snap.exists()) return EMPTY
  const raw = snap.data() as Partial<CloudData>
  return {
    presets: raw.presets ?? {},
    library: Array.isArray(raw.library) ? raw.library : [],
    guitar: typeof raw.guitar === 'string' ? raw.guitar : '',
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : 0,
  }
}

export async function pushCloud(uid: string, data: CloudData): Promise<void> {
  const { db, dbApi } = await load()
  await dbApi.setDoc(dbApi.doc(db, 'users', uid, 'data', 'studio'), {
    ...data,
    updatedAt: Date.now(),
  })
}

/**
 * Junta nuvem e local sem perder trabalho:
 * - biblioteca: união por id (gerar num aparelho e noutro não apaga nada)
 * - presets e guitarra: vence o lado com `updatedAt` mais recente
 */
export function mergeCloud(
  cloud: CloudData,
  local: Omit<CloudData, 'updatedAt'>,
  localUpdatedAt: number,
): CloudData {
  const cloudNewer = cloud.updatedAt > localUpdatedAt

  const byId = new Map<string, LibraryEntry>()
  for (const entry of [...cloud.library, ...local.library]) {
    const existing = byId.get(entry.id)
    if (!existing || entry.createdAt > existing.createdAt)
      byId.set(entry.id, entry)
  }
  const library = [...byId.values()].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  )

  return {
    presets: cloudNewer
      ? { ...local.presets, ...cloud.presets }
      : { ...cloud.presets, ...local.presets },
    library,
    guitar: cloudNewer
      ? cloud.guitar || local.guitar
      : local.guitar || cloud.guitar,
    updatedAt: Math.max(cloud.updatedAt, localUpdatedAt),
  }
}
