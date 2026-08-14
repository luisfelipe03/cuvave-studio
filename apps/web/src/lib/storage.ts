import { clampValues, defaultPresetValues } from 'profiles'
import type { DeviceProfile, PresetValues } from 'profiles'

export interface SavedPresets {
  version: 1
  savedAt: string
  presets: PresetValues[]
}

const PRESETS_KEY = 'cuvave-studio.presets.v1'
const API_KEY_KEY = 'cuvave-studio.deepseek-key'

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

export function savePresets(profile: DeviceProfile, presets: PresetValues[]) {
  const payload: SavedPresets = {
    version: 1,
    savedAt: new Date().toISOString(),
    presets: presets.map((p) => clampValues(profile, p)),
  }
  localStorage.setItem(PRESETS_KEY, JSON.stringify(payload))
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

export function initialPresets(profile: DeviceProfile): PresetValues[] {
  const stored = loadPresets(profile)
  if (stored.length === profile.presetCount) return stored
  return Array.from({ length: profile.presetCount }, () =>
    defaultPresetValues(profile),
  )
}
