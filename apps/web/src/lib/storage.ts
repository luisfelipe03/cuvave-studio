import { clampValues, defaultPresetValues } from 'profiles'
import type { DeviceProfile, PresetValues } from 'profiles'

export interface SavedPresets {
  version: 1
  savedAt: string
  presets: PresetValues[]
}

const PRESETS_KEY = 'cuvave-studio.presets.v1'
const API_KEY_KEY = 'cuvave-studio.deepseek-key'
const GUITAR_KEY = 'cuvave-studio.guitar'
const LIBRARY_KEY = 'cuvave-studio.library.v1'
const PLAYLISTS_KEY = 'cuvave-studio.playlists.v1'
const LIBRARY_LIMIT = 30
const PLAYLISTS_LIMIT = 20
const UPDATED_AT_KEY = 'cuvave-studio.updated-at'

export function loadPresets(profile: DeviceProfile): PresetValues[] {
  try {
    const raw = localStorage.getItem(PRESETS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as SavedPresets
    if (!Array.isArray(parsed.presets)) return []
    return parsed.presets.map((p) => clampValues(profile, p))
  } catch {
    return []
  }
}

/** Marca quando os dados locais mudaram — usado pra resolver conflito com a nuvem. */
export function touchLocal() {
  localStorage.setItem(UPDATED_AT_KEY, String(Date.now()))
}

export function localUpdatedAt(): number {
  return Number(localStorage.getItem(UPDATED_AT_KEY) ?? 0)
}

export function savePresets(profile: DeviceProfile, presets: PresetValues[]) {
  const payload: SavedPresets = {
    version: 1,
    savedAt: new Date().toISOString(),
    presets: presets.map((p) => clampValues(profile, p)),
  }
  localStorage.setItem(PRESETS_KEY, JSON.stringify(payload))
  touchLocal()
}

export function loadApiKey(): string {
  return localStorage.getItem(API_KEY_KEY) ?? ''
}

export function saveApiKey(key: string) {
  localStorage.setItem(API_KEY_KEY, key.trim())
}

export function hasStoredPresets(): boolean {
  return localStorage.getItem(PRESETS_KEY) !== null
}

/** Guitarra do usuário — usada pra sugerir posição de captador. */
export function loadGuitar(): string {
  return localStorage.getItem(GUITAR_KEY) ?? ''
}

export function saveGuitar(guitar: string) {
  localStorage.setItem(GUITAR_KEY, guitar.trim())
  touchLocal()
}

/**
 * Biblioteca de presets gerados: cada geração fica guardada com o nome da
 * música, então dá pra montar uma coleção e depois decidir quais entram nos
 * slots do pedal (que são poucos).
 */
export interface LibraryEntry {
  id: string
  song: string
  name: string
  pickup: string
  explanation: string
  values: PresetValues
  createdAt: string
  /** tokens consumidos na geração, quando a API informou */
  tokens?: number
}

export function loadLibrary(profile: DeviceProfile): LibraryEntry[] {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as LibraryEntry[]
    if (!Array.isArray(parsed)) return []
    return parsed.map((e) => ({ ...e, values: clampValues(profile, e.values) }))
  } catch {
    return []
  }
}

export function saveLibrary(entries: LibraryEntry[]) {
  localStorage.setItem(
    LIBRARY_KEY,
    JSON.stringify(entries.slice(0, LIBRARY_LIMIT)),
  )
  touchLocal()
}

/**
 * Playlists: listas ordenadas de presets da biblioteca, pensadas pra montar
 * o pedal rápido — "aplicar" grava os 3 primeiros itens nos slots A/B/C na
 * ordem da lista. Referenciam a biblioteca por id; item órfão (entrada
 * apagada) é pulado na hora de aplicar.
 */
export interface Playlist {
  id: string
  name: string
  entryIds: string[]
  createdAt: string
}

export function loadPlaylists(): Playlist[] {
  try {
    const raw = localStorage.getItem(PLAYLISTS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Playlist[]
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((p) => p && typeof p.name === 'string' && Array.isArray(p.entryIds))
      .map((p) => ({ ...p, entryIds: p.entryIds.filter((id) => typeof id === 'string') }))
  } catch {
    return []
  }
}

export function savePlaylists(playlists: Playlist[]) {
  localStorage.setItem(
    PLAYLISTS_KEY,
    JSON.stringify(playlists.slice(0, PLAYLISTS_LIMIT)),
  )
  touchLocal()
}

export function initialPresets(profile: DeviceProfile): PresetValues[] {
  const stored = loadPresets(profile)
  if (stored.length === profile.presetCount) return stored
  return Array.from({ length: profile.presetCount }, () =>
    defaultPresetValues(profile),
  )
}
