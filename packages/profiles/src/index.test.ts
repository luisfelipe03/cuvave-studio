import { describe, expect, it } from 'vitest'
import { cubeBabyProfile, factoryPresets } from './index'

/**
 * Os presets de fábrica são o dump real do pedal (M1). Este teste trava os
 * bytes: se alguém mexer no `bankOrder` sem mexer no `factoryBank`, o
 * "Restaurar de fábrica" passaria a gravar um preset trocado no hardware.
 */
describe('presets de fábrica', () => {
  it('tem os três slots com 13 campos cada', () => {
    expect(cubeBabyProfile.factoryBank).toHaveLength(3)
    for (const slot of cubeBabyProfile.factoryBank) {
      expect(slot).toHaveLength(cubeBabyProfile.bankOrder.length)
    }
  })

  it('decodifica o slot A igual ao que o CubeSuite mostra', () => {
    const [a] = factoryPresets(cubeBabyProfile)
    // Conferido na tela do CubeSuite com o pedal de fábrica:
    // VOLUME 65, IR CAB 4, REVERB 5, MIX 0, FB 52, TIME 20, MOD 7,
    // TONE 9, GAIN 7, TYPE 7.
    expect(a).toMatchObject({
      volume: 65,
      ir_cab: 4,
      reverb: 5,
      mix: 0,
      fb: 52,
      time: 20,
      mod: 7,
      tone: 9,
      gain: 7,
      type: 7,
    })
  })

  it('mantém os flags de seção ligados nos três slots', () => {
    for (const preset of factoryPresets(cubeBabyProfile)) {
      expect(preset.ir_section).toBe(1)
      expect(preset.delay_section).toBe(1)
      expect(preset.tone_section).toBe(1)
    }
  })

  it('devolve valores dentro do range do schema', () => {
    for (const preset of factoryPresets(cubeBabyProfile)) {
      for (const param of cubeBabyProfile.parameters) {
        expect(preset[param.id]).toBeGreaterThanOrEqual(param.min)
        expect(preset[param.id]).toBeLessThanOrEqual(param.max)
      }
    }
  })
})
