import { clampValues } from 'profiles'
import type { DeviceProfile, PresetValues } from 'profiles'
import { BANK_FIELD_COUNT, decodeBank, encodeBank } from 'protocol'

/**
 * Conversão entre os presets do app (id → valor, incluindo flags de seção)
 * e a imagem de 48 bytes do bank do pedal. A ordem dos 13 campos de cada
 * slot vem do `profile.bankOrder` (dump real do M1).
 */
export function valuesToSlots(
  profile: DeviceProfile,
  presets: PresetValues[],
): number[][] {
  return presets.slice(0, 3).map((values) => {
    const clamped = clampValues(profile, values)
    return profile.bankOrder.slice(0, BANK_FIELD_COUNT).map((id) => clamped[id])
  })
}

export function slotsToValues(
  profile: DeviceProfile,
  slots: number[][],
): PresetValues[] {
  return slots.slice(0, 3).map((slot) => {
    const raw: PresetValues = {}
    profile.bankOrder.forEach((id, i) => {
      if (i < BANK_FIELD_COUNT) raw[id] = slot[i] ?? 0
    })
    return clampValues(profile, raw)
  })
}

export function bankToBytes(
  profile: DeviceProfile,
  presets: PresetValues[],
): Uint8Array {
  return encodeBank(valuesToSlots(profile, presets))
}

export function bytesToPresets(
  profile: DeviceProfile,
  bytes: Uint8Array,
): PresetValues[] {
  return slotsToValues(profile, decodeBank(bytes))
}
