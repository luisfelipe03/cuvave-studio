/**
 * Perfis de dispositivo (Device Profiles) da família Cuvave/M-VAVE.
 *
 * Cada pedal = um profile declarativo: o restante do app (UI, IA, transporte)
 * é genérico e renderiza/valida a partir daqui. Adicionar um pedal novo =
 * escrever um profile novo, sem tocar no core.
 *
 * Fonte dos dados do cube-baby: manual oficial + esquema comunitário do
 * cube-baby-presets (ranges provisionais — confirmar no dump do M1).
 */

export interface ParameterOption {
  value: number
  label: string
}

export interface Parameter {
  id: string
  label: string
  /** range inclusivo do parâmetro */
  min: number
  max: number
  /** rótulo da unidade/nome exibido ao lado do valor */
  format?: (value: number) => string
  /** parâmetros discretos (type, ir_cab) listam as opções aqui */
  options?: ParameterOption[]
  /** zonas visuais (ex: MOD 0–6 chorus, 7–8 off, 9–15 phaser) */
  zones?: { label: string; min: number; max: number }[]
  /** valor padrão de fábrica (aproximado, confirmar no M1) */
  default: number
  /** não aparece na UI (ex: flags de seção) — a UI filtra e o app gerencia */
  hidden?: boolean
}

export interface DeviceProfile {
  id: string
  name: string
  transport: 'usb-midi'
  /** regex pra identificar o dispositivo na lista de portas MIDI */
  detect: RegExp
  presetCount: number
  presetLabels: string[]
  parameters: Parameter[]
  /**
   * Ordem dos ids dos parâmetros dentro de cada slot de 13 bytes do bank
   * (dump real do M1). Inclui os flags de seção, que são campos de verdade.
   */
  bankOrder: string[]
  /**
   * Presets de fábrica, um array de valores por slot na mesma ordem do
   * `bankOrder` — dump real do pedal, não invenção. É o que o "Restaurar
   * de fábrica" grava.
   */
  factoryBank: number[][]
  irFormat: {
    /** taxa de amostragem esperada pelo pedal (Hz) */
    sampleRate: number
    /** quantidade de slots de IR */
    slots: number
    /** range do simulador de distância do microfone (0–100) */
    distanceRange: [number, number]
  }
}

const PREAMPS: ParameterOption[] = [
  { value: 0, label: 'Power-Zone Clean' },
  { value: 1, label: 'US Gold 100 Clean' },
  { value: 2, label: 'Two Stone Coral OD' },
  { value: 3, label: 'Doctor3 B' },
  { value: 4, label: 'Cali JP A' },
  { value: 5, label: 'Day Tripper OD' },
  { value: 6, label: 'Shittcow Dist' },
  { value: 7, label: 'Wo Stone Coral OD' },
  { value: 8, label: 'Mr Smith Dist' },
]

const IR_CABS: ParameterOption[] = [
  { value: 0, label: 'IR desligado' },
  { value: 1, label: 'Line 6 Vetta 1×12' },
  { value: 2, label: 'Marshall 1960AV 4×12' },
  { value: 3, label: 'Marshall 1960A T75 4×12' },
  { value: 4, label: 'VHT Deliverance 2×12' },
  { value: 5, label: 'Soldano 2×12' },
  { value: 6, label: 'Peavey 5150 + Mesa 4×12' },
  { value: 7, label: 'JSX KT77 + Mesa 4×12' },
  { value: 8, label: 'Diezel V30 SM57 4×12' },
]

export const cubeBabyProfile: DeviceProfile = {
  id: 'cube-baby',
  name: 'Cube Baby',
  transport: 'usb-midi',
  // O Cube Baby costuma se anunciar como "USB2.0 Device" (nome genérico
  // de device class USB MIDI) — não confiar só no nome da marca. A
  // validação fina acontece no M1/M2 pelo protocolo (NameVersion 0x11).
  detect: /cube\s*baby|CUVAVE|USB2\.0\s*Device/i,
  presetCount: 3,
  presetLabels: ['A', 'B', 'C'],
  parameters: [
    {
      id: 'type',
      label: 'Preamp',
      min: 0,
      max: 8,
      options: PREAMPS,
      default: 4,
      format: (v) => PREAMPS[v]?.label ?? String(v),
    },
    { id: 'gain', label: 'Gain', min: 0, max: 7, default: 4 },
    { id: 'tone', label: 'Tone', min: 0, max: 15, default: 8 },
    {
      id: 'mod',
      label: 'Mod',
      min: 0,
      max: 15,
      default: 7,
      zones: [
        { label: 'Chorus', min: 0, max: 6 },
        { label: 'Off', min: 7, max: 8 },
        { label: 'Phaser', min: 9, max: 15 },
      ],
    },
    { id: 'time', label: 'Time', min: 0, max: 31, default: 12 },
    { id: 'fb', label: 'Feedback', min: 0, max: 127, default: 40 },
    { id: 'mix', label: 'Mix', min: 0, max: 118, default: 30 },
    { id: 'reverb', label: 'Reverb', min: 0, max: 15, default: 6 },
    {
      id: 'ir_cab',
      label: 'IR Cab',
      min: 0,
      max: 8,
      options: IR_CABS,
      default: 4,
      format: (v) => IR_CABS[v]?.label ?? String(v),
    },
    { id: 'volume', label: 'Volume', min: 0, max: 127, default: 100 },
    // Flags de seção — campos reais do bank (offsets 10, 11 e 12), mas a UI
    // não os mostra: o app os gerencia (mexer no knob liga/desliga o módulo).
    { id: 'ir_section', label: 'Módulo IR', min: 0, max: 1, default: 1, hidden: true },
    { id: 'delay_section', label: 'Módulo Delay', min: 0, max: 1, default: 1, hidden: true },
    { id: 'tone_section', label: 'Módulo Amp', min: 0, max: 1, default: 1, hidden: true },
  ],
  // Ordem dos ids nos 13 bytes de cada slot do bank (confirmada no dump real
  // e no save path do CubeSuite). Os 3 bytes finais de cada slot de 16 são
  // padding.
  bankOrder: [
    'type',
    'gain',
    'tone',
    'reverb',
    'fb',
    'volume',
    'time',
    'mix',
    'mod',
    'ir_cab',
    'ir_section',
    'delay_section',
    'tone_section',
  ],
  // Dump dos presets de fábrica lido do pedal do Felipe (M1, 14/08/2026).
  // Confere com o que o CubeSuite mostra no slot A: volume 65, ir_cab 4,
  // reverb 5, mix 0, fb 52, time 20, mod 7, tone 9, gain 7, type 7.
  factoryBank: [
    [0x07, 0x07, 0x09, 0x05, 0x34, 0x41, 0x14, 0x00, 0x07, 0x04, 1, 1, 1],
    [0x04, 0x02, 0x05, 0x05, 0x2c, 0x46, 0x17, 0x1e, 0x07, 0x05, 1, 1, 1],
    [0x01, 0x07, 0x07, 0x05, 0x34, 0x6f, 0x14, 0x0c, 0x05, 0x02, 1, 1, 1],
  ],
  irFormat: {
    sampleRate: 48000,
    slots: 8,
    distanceRange: [0, 100],
  },
}

export const profiles = [cubeBabyProfile]

export function getProfile(id: string): DeviceProfile | undefined {
  return profiles.find((p) => p.id === id)
}

/** valores de um preset: id do parâmetro → valor numérico */
export type PresetValues = Record<string, number>

/** valida e clampa um objeto de valores contra o schema do profile */
export function clampValues(
  profile: DeviceProfile,
  values: PresetValues,
): PresetValues {
  const out: PresetValues = {}
  for (const param of profile.parameters) {
    const v = values[param.id]
    if (typeof v !== 'number' || Number.isNaN(v)) {
      out[param.id] = param.default
      continue
    }
    out[param.id] = Math.min(param.max, Math.max(param.min, Math.round(v)))
  }
  return out
}

/**
 * Presets de fábrica como valores do app. Mesma conversão que o bank do
 * pedal usa: cada posição do slot é o parâmetro de mesmo índice em
 * `bankOrder`.
 */
export function factoryPresets(profile: DeviceProfile): PresetValues[] {
  return profile.factoryBank.map((slot) => {
    const raw: PresetValues = {}
    profile.bankOrder.forEach((id, i) => {
      raw[id] = slot[i] ?? 0
    })
    return clampValues(profile, raw)
  })
}

export function defaultPresetValues(profile: DeviceProfile): PresetValues {
  const out: PresetValues = {}
  for (const param of profile.parameters) out[param.id] = param.default
  return out
}

/**
 * Regra de seção do pedal: mexer em certos knobs liga/desliga o módulo
 * correspondente — mesma semântica dos knobs físicos (mix no mínimo desliga
 * o delay, ir_cab em 0 desliga o IR, amp desligado volta a ligar ao mexer
 * em type/gain/tone). Devolve o flag que deve acompanhar a mudança.
 */
export function sectionForParam(
  paramId: string,
  value: number,
): { id: string; value: number } | null {
  switch (paramId) {
    case 'mix':
      return { id: 'delay_section', value: value > 0 ? 1 : 0 }
    case 'ir_cab':
      return { id: 'ir_section', value: value > 0 ? 1 : 0 }
    case 'type':
    case 'gain':
    case 'tone':
      return { id: 'tone_section', value: 1 }
    default:
      return null
  }
}

/**
 * Aplica as regras de seção a um preset inteiro — usado pra normalizar
 * presets vindos de fora (IA, playlists, banco) antes de virar estado.
 */
export function normalizeSections(
  profile: DeviceProfile,
  values: PresetValues,
): PresetValues {
  const out = { ...clampValues(profile, values) }
  for (const param of profile.parameters) {
    if (param.hidden) continue
    const side = sectionForParam(param.id, out[param.id])
    if (side) out[side.id] = side.value
  }
  return out
}
