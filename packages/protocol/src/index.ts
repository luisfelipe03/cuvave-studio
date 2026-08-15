/**
 * Core compartilhado do protocolo Cuvave/M-VAVE.
 *
 * Duas camadas:
 *
 * 1. **Frame** (bytes "de verdade"): `00 59 | tipo (1B) | tamanho (3B LE) |
 *    conteúdo | checksum (1B)`.
 * 2. **SysEx** (o que trafega no MIDI): o frame inteiro passa por um
 *    empacotador de 7 bits e é embrulhado entre `F0` e `F7`.
 *
 * Ambas foram extraídas do binário do CubeSuite.app (x86_64, símbolos
 * preservados): `CUSBConnect::add_checksum` e `u8ToMidi`. Os vetores de teste
 * são frames reais capturados do Cube Baby — ver `index.test.ts`.
 */

/** `s_arrSysexHead` no binário do CubeSuite. */
const HEAD = [0x00, 0x59] as const

/** Comandos conhecidos (tipo do frame). */
export const Cmd = {
  Init: 0x00,
  NameVersion: 0x11,
  Erase: 0x21,
  WriteMemory: 0x22,
  ReadMemory: 0x23,
  /** troca de modo do pedal (make_mode_change_packet no CubeSuite) */
  ModeChange: 0x50,
} as const

export interface Frame {
  type: number
  content: Uint8Array
}

/**
 * `add_checksum`: soma os bytes do conteúdo com wrap de 8 bits e devolve o
 * complemento. O header, o tipo e o tamanho ficam de fora da conta.
 */
export function checksum(content: Uint8Array): number {
  let sum = 0
  for (const b of content) sum = (sum + b) & 0xff
  return sum ^ 0xff
}

/** Monta o frame decodificado (ainda sem o empacotamento de 7 bits). */
export function buildFrame(
  type: number,
  content: ArrayLike<number>,
): Uint8Array {
  const body = Uint8Array.from(content)
  const frame = new Uint8Array(HEAD.length + 4 + body.length + 1)
  frame.set(HEAD, 0)
  frame[2] = type & 0xff
  frame[3] = body.length & 0xff
  frame[4] = (body.length >>> 8) & 0xff
  frame[5] = (body.length >>> 16) & 0xff
  frame.set(body, 6)
  frame[frame.length - 1] = checksum(body)
  return frame
}

/** Lê um frame decodificado, validando header, tamanho e checksum. */
export function parseFrame(frame: Uint8Array): Frame {
  if (frame.length < 7) throw new Error(`frame curto: ${frame.length} bytes`)
  if (frame[0] !== HEAD[0] || frame[1] !== HEAD[1])
    throw new Error('header inválido: esperado 00 59')

  const size = frame[3] | (frame[4] << 8) | (frame[5] << 16)
  const content = frame.slice(6, 6 + size)
  if (content.length !== size)
    throw new Error(`tamanho declarado (${size}) maior que o frame`)

  const esperado = checksum(content)
  const recebido = frame[6 + size]
  if (recebido !== esperado)
    throw new Error(
      `checksum inválido: calculado ${esperado.toString(16)}, recebido ${recebido?.toString(16)}`,
    )

  return { type: frame[2], content }
}

/**
 * `u8ToMidi`: bitstream little-endian de 7 bits, entre F0 e F7.
 *
 * Efeito colateral curioso: o header `00 59` sai daqui como `00 32` — que é
 * exatamente o "manufacturer ID" que a documentação da comunidade descreve.
 * Não é ID de fabricante nenhum, é o header já empacotado.
 */
export function encode7bit(bytes: Uint8Array): Uint8Array {
  const out: number[] = [0xf0]
  let acc = 0
  let bits = 0
  for (const b of bytes) {
    acc |= b << bits
    bits += 8
    while (bits >= 7) {
      out.push(acc & 0x7f)
      acc >>>= 7
      bits -= 7
    }
  }
  if (bits > 0) out.push(acc & 0x7f)
  out.push(0xf7)
  return Uint8Array.from(out)
}

/** Inverso de `encode7bit`; aceita a mensagem com ou sem F0/F7. */
export function decode7bit(sysex: Uint8Array): Uint8Array {
  let payload = sysex
  if (payload[0] === 0xf0) payload = payload.subarray(1)
  if (payload[payload.length - 1] === 0xf7)
    payload = payload.subarray(0, payload.length - 1)

  const out: number[] = []
  let acc = 0
  let bits = 0
  for (const b of payload) {
    acc |= (b & 0x7f) << bits
    bits += 7
    while (bits >= 8) {
      out.push(acc & 0xff)
      acc >>>= 8
      bits -= 8
    }
  }
  return Uint8Array.from(out)
}

/** Atalho: monta o frame e já devolve pronto pro `MIDIOutput.send()`. */
export function buildSysEx(
  type: number,
  content: ArrayLike<number>,
): Uint8Array {
  return encode7bit(buildFrame(type, content))
}

/** Lê uma mensagem SysEx crua vinda do pedal. */
export function parseSysEx(sysex: Uint8Array): Frame {
  return parseFrame(decode7bit(sysex))
}

/**
 * Banks de memória (`EFlashType` no CubeSuite).
 *
 * `FxCtrlPanel` saiu do binário: `fx_ctrl_panel_write` chama
 * `flash_write_and_verify` com o tipo fixo em 4 — é por aí que o software
 * oficial manda IR e parâmetros ao vivo. `Presets` (5) é o bank que
 * respondeu ao dump dos presets de fábrica no pedal do Felipe.
 */
export const Bank = {
  FxCtrlPanel: 0x04,
  Presets: 0x05,
} as const

/** Cabeçalho de endereçamento: bank + endereço (4B LE) + tamanho (3B LE). */
function addressHeader(bank: number, address: number, size: number): number[] {
  return [
    bank & 0xff,
    address & 0xff,
    (address >>> 8) & 0xff,
    (address >>> 16) & 0xff,
    (address >>> 24) & 0xff,
    size & 0xff,
    (size >>> 8) & 0xff,
    (size >>> 16) & 0xff,
  ]
}

/** ReadMemory (0x23), pronto pro `send()`. */
export function readMemory(
  bank: number,
  address: number,
  size: number,
): Uint8Array {
  return buildSysEx(Cmd.ReadMemory, addressHeader(bank, address, size))
}

/** WriteMemory (0x22), pronto pro `send()`. O tamanho vem dos dados. */
export function writeMemory(
  bank: number,
  address: number,
  data: ArrayLike<number>,
): Uint8Array {
  const body = Uint8Array.from(data)
  return buildSysEx(Cmd.WriteMemory, [
    ...addressHeader(bank, address, body.length),
    ...body,
  ])
}

/**
 * "Save 0": o comando que faz o pedal **aplicar** o que foi escrito.
 *
 * Escrever memória funciona — o byte muda e a releitura confirma —, mas o som
 * não muda junto, porque o DSP trabalha com a cópia que carregou. No CubeSuite
 * quem fecha esse ciclo é `flash_save_0(EFlashType, endereço)`, chamado no
 * clique do botão de salvar. O `make_falsh_save_0` mostra o formato: um
 * WriteMemory (`0x22`) com o cabeçalho de endereçamento e **zero byte de
 * dados** — não escreve nada, só manda aplicar.
 */
export function saveCommit(bank: number, address: number): Uint8Array {
  return writeMemory(bank, address, [])
}

/**
 * Alterna o modo do pedal (`0x50`).
 *
 * O Cube Baby tem três modos — PRESET, LIVE e EDIT — e no LIVE o som sai da
 * posição física dos knobs, ignorando o que está gravado no preset. Isso
 * explicaria por que escrever na memória não muda o áudio.
 *
 * `CUSBConnect::set_system_mode` monta este pacote em `make_mode_change_packet`
 * e o dispara via `send_mode_change_request()`: tipo `0x50`, conteúdo fixo
 * `7f 7f`. Não recebe qual modo se quer — é um alterna, e quem chama confere o
 * resultado com `get_system_mode` depois.
 */
export function modeChange(): Uint8Array {
  return buildSysEx(Cmd.ModeChange, [0x7f, 0x7f])
}

export interface ReadResponse {
  bank: number
  address: number
  data: Uint8Array
}

/**
 * A resposta de ReadMemory ecoa os 8 bytes de endereçamento do pedido antes
 * dos dados — confirmado no pedal.
 */
export function parseReadResponse(frame: Frame): ReadResponse {
  if (frame.type !== Cmd.ReadMemory)
    throw new Error(`esperava ReadMemory (0x23), veio 0x${frame.type.toString(16)}`)
  const c = frame.content
  if (c.length < 8) throw new Error('resposta de leitura sem cabeçalho')
  return {
    bank: c[0],
    address: (c[1] | (c[2] << 8) | (c[3] << 16) | (c[4] << 24)) >>> 0,
    data: c.slice(8),
  }
}

/**
 * Resposta de ACK do pedal. Vem do `make_responds_packet(buf, ok)` do
 * CubeSuite: conteúdo `0x00` quando deu certo, `0x01` quando falhou —
 * ou seja, o `00` que o pedal devolve depois de um WriteMemory é sucesso.
 */
export function isAck(frame: Frame): boolean {
  return frame.type === Cmd.Init && frame.content[0] === 0x00
}
