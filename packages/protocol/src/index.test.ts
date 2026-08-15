import { describe, expect, it } from 'vitest'
import {
  BANK_ADDRESS,
  BANK_FIELD_COUNT,
  BANK_MEMORY,
  BANK_SIZE,
  BANK_SLOT_BYTES,
  buildFrame,
  buildSysEx,
  checksum,
  decode7bit,
  decodeBank,
  encode7bit,
  encodeBank,
  isAck,
  liveParamAddress,
  modeChange,
  parseFrame,
  parseReadResponse,
  parseSysEx,
  readMemory,
  saveCommit,
  writeMemory,
} from './index'

/**
 * Os vetores abaixo NÃO são inventados: são frames reais capturados do Cube
 * Baby do Felipe em 14/08/2026 (console do Chrome, Web MIDI), mais o
 * algoritmo extraído do binário do CubeSuite.app (`CUSBConnect::add_checksum`
 * e `u8ToMidi`, x86_64, símbolos não-stripped).
 */

/** ACK recebido depois de todo WriteMemory (0x22). */
const ACK_REAL = [0x00, 0x59, 0x00, 0x01, 0x00, 0x00, 0x00, 0xff]

/** Resposta de ReadMemory (0x23) na área viva: 8 bytes de eco + 45 de dados. */
const READ_ECHO = [0x05, 0x00, 0x00, 0x00, 0x80, 0x2d, 0x00, 0x00]
const READ_CONTENT = [...READ_ECHO, ...new Array(45).fill(0)]
const READ_REAL = [0x00, 0x59, 0x23, 0x35, 0x00, 0x00, ...READ_CONTENT, 0x4d]

describe('checksum', () => {
  // add_checksum: soma os bytes com wrap de 8 bits e devolve o complemento.
  it('é o complemento da soma do conteúdo', () => {
    expect(checksum(new Uint8Array([0x05, 0x80, 0x2d]))).toBe(0x4d)
  })

  it('de conteúdo vazio ou zerado é 0xFF', () => {
    expect(checksum(new Uint8Array([0x00]))).toBe(0xff)
  })

  it('faz wrap em 8 bits', () => {
    // 0xFF + 0x02 = 0x101 -> 0x01 -> complemento 0xFE
    expect(checksum(new Uint8Array([0xff, 0x02]))).toBe(0xfe)
  })
})

describe('buildFrame', () => {
  it('monta o ACK exatamente como o pedal responde', () => {
    expect([...buildFrame(0x00, [0x00])]).toEqual(ACK_REAL)
  })

  it('grava o tamanho em 3 bytes little-endian', () => {
    // 53 bytes de conteúdo -> 35 00 00
    expect([...buildFrame(0x23, READ_CONTENT)].slice(3, 6)).toEqual([
      0x35, 0x00, 0x00,
    ])
  })
})

describe('parseFrame', () => {
  it('decodifica a resposta real de ReadMemory', () => {
    const frame = parseFrame(new Uint8Array(READ_REAL))
    expect(frame.type).toBe(0x23)
    expect([...frame.content]).toEqual(READ_CONTENT)
  })

  it('rejeita frame com checksum corrompido', () => {
    const corrompido = [...ACK_REAL]
    corrompido[7] = 0x00
    expect(() => parseFrame(new Uint8Array(corrompido))).toThrow(/checksum/i)
  })

  it('rejeita frame com header errado', () => {
    const corrompido = [...ACK_REAL]
    corrompido[1] = 0x58
    expect(() => parseFrame(new Uint8Array(corrompido))).toThrow(/header/i)
  })
})

describe('encode7bit', () => {
  it('embrulha o payload entre F0 e F7', () => {
    const sysex = encode7bit(new Uint8Array([0x00, 0x59]))
    expect(sysex[0]).toBe(0xf0)
    expect(sysex[sysex.length - 1]).toBe(0xf7)
  })

  it('transforma o header 00 59 nos bytes 00 32 do SysEx', () => {
    // O "manufacturer ID 00 32" documentado pela comunidade é, na verdade,
    // o header 00 59 já passado pelo empacotador de 7 bits.
    const sysex = encode7bit(new Uint8Array([0x00, 0x59]))
    expect([...sysex].slice(1, 3)).toEqual([0x00, 0x32])
  })

  it('nunca emite byte com o bit 7 ligado no payload', () => {
    const payload = encode7bit(new Uint8Array(READ_REAL)).slice(1, -1)
    for (const b of payload) expect(b).toBeLessThan(0x80)
  })
})

describe('decode7bit', () => {
  it('desfaz o encode de qualquer frame real', () => {
    for (const frame of [ACK_REAL, READ_REAL]) {
      const bytes = new Uint8Array(frame)
      expect([...decode7bit(encode7bit(bytes))]).toEqual(frame)
    }
  })
})

describe('readMemory', () => {
  // Frame idêntico ao que o Felipe mandou no console e o pedal respondeu.
  it('monta o pedido de leitura da área viva (bank 5, 0x80000000, 45 bytes)', () => {
    const frame = parseSysEx(readMemory(0x05, 0x80000000, 45))
    expect(frame.type).toBe(0x23)
    expect([...frame.content]).toEqual([
      0x05, 0x00, 0x00, 0x00, 0x80, 0x2d, 0x00, 0x00,
    ])
  })

  it('monta o pedido dos presets de fábrica (bank 5, 0x0000, 45 bytes)', () => {
    const frame = parseSysEx(readMemory(0x05, 0x0000, 45))
    expect([...frame.content]).toEqual([
      0x05, 0x00, 0x00, 0x00, 0x00, 0x2d, 0x00, 0x00,
    ])
  })
})

describe('writeMemory', () => {
  it('monta a escrita de 1 byte no volume ao vivo do preset A', () => {
    const frame = parseSysEx(writeMemory(0x05, 0x80000005, [0x00]))
    expect(frame.type).toBe(0x22)
    expect([...frame.content]).toEqual([
      0x05, 0x05, 0x00, 0x00, 0x80, 0x01, 0x00, 0x00, 0x00,
    ])
  })

  it('declara o tamanho a partir dos dados, não do endereço', () => {
    const frame = parseSysEx(writeMemory(0x04, 0x764, [1, 2, 3, 4, 5]))
    expect([...frame.content].slice(5, 8)).toEqual([0x05, 0x00, 0x00])
  })
})

describe('saveCommit', () => {
  // make_falsh_save_0 no binário: tipo 0x22, tamanho 8, e o campo de tamanho
  // dos dados zerado — um WriteMemory que não escreve nada. É o "aplique isso".
  it('monta um WriteMemory sem dados, só com o endereçamento', () => {
    const frame = parseSysEx(saveCommit(0x05, 0x0000))
    expect(frame.type).toBe(0x22)
    expect(frame.content.length).toBe(8)
    expect([...frame.content]).toEqual([
      0x05, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ])
  })

  it('declara tamanho de dados zero mesmo com endereço alto', () => {
    const frame = parseSysEx(saveCommit(0x04, 0x0768))
    expect([...frame.content]).toEqual([
      0x04, 0x68, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00,
    ])
  })
})

describe('modeChange', () => {
  // make_mode_change_packet: tipo 0x50, tamanho 2, conteúdo fixo 7f 7f.
  // Não recebe parâmetro nenhum — set_system_mode manda isso e depois confere
  // o modo, então é um alterna-modo, não um "vá para o modo X".
  it('monta o pacote fixo de troca de modo', () => {
    const frame = parseSysEx(modeChange())
    expect(frame.type).toBe(0x50)
    expect([...frame.content]).toEqual([0x7f, 0x7f])
  })

  it('fecha com o checksum que o pedal espera', () => {
    // 0x7f + 0x7f = 0xFE -> complemento 0x01
    const bytes = decode7bit(modeChange())
    expect(bytes[bytes.length - 1]).toBe(0x01)
  })
})

describe('parseReadResponse', () => {
  it('separa o eco do pedido dos dados devolvidos', () => {
    const resposta = parseReadResponse(parseFrame(new Uint8Array(READ_REAL)))
    expect(resposta.bank).toBe(0x05)
    expect(resposta.address).toBe(0x80000000)
    expect(resposta.data.length).toBe(45)
    expect([...resposta.data]).toEqual(new Array(45).fill(0))
  })
})

describe('isAck', () => {
  // make_responds_packet(buf, ok): escreve 0 quando ok, 1 quando falhou.
  it('reconhece o ACK de sucesso que o pedal manda após escrever', () => {
    expect(isAck(parseFrame(new Uint8Array(ACK_REAL)))).toBe(true)
  })

  it('reconhece a resposta de falha (conteúdo 0x01)', () => {
    expect(isAck(parseFrame(buildFrame(0x00, [0x01])))).toBe(false)
  })
})

describe('buildSysEx', () => {
  it('produz mensagem pronta pro Web MIDI a partir de tipo + conteúdo', () => {
    const sysex = buildSysEx(0x00, [0x00])
    expect(sysex[0]).toBe(0xf0)
    expect(sysex[sysex.length - 1]).toBe(0xf7)
    expect([...decode7bit(sysex)]).toEqual(ACK_REAL)
  })
})

/**
 * Bank real lido do pedal em 14/08/2026 (após reset de fábrica), com o
 * volume do preset A em 0x41 e mix do A em 0x1e — exatamente os bytes que
 * o pedal devolveu e que depois foram gravados de volta com sucesso.
 */
const BANK_REAL = [
  0x07, 0x07, 0x09, 0x05, 0x34, 0x41, 0x14, 0x1e, 0x07, 0x04, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00,
  0x04, 0x02, 0x05, 0x05, 0x2c, 0x46, 0x17, 0x1e, 0x07, 0x05, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00,
  0x01, 0x07, 0x07, 0x05, 0x34, 0x6f, 0x14, 0x0c, 0x05, 0x02, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00,
]

describe('bank', () => {
  it('constantes batem com o mapa de memória confirmado', () => {
    expect(BANK_MEMORY).toBe(0x05)
    expect(BANK_ADDRESS).toBe(0x00000000)
    expect(BANK_SIZE).toBe(48)
    expect(BANK_SLOT_BYTES).toBe(16)
    expect(BANK_FIELD_COUNT).toBe(13)
  })

  it('decodeBank separa os 3 slots de 13 campos do bank real', () => {
    const slots = decodeBank(new Uint8Array(BANK_REAL))
    expect(slots).toHaveLength(3)
    expect(slots[0]).toEqual([0x07, 0x07, 0x09, 0x05, 0x34, 0x41, 0x14, 0x1e, 0x07, 0x04, 0x01, 0x01, 0x01])
    expect(slots[1]).toEqual([0x04, 0x02, 0x05, 0x05, 0x2c, 0x46, 0x17, 0x1e, 0x07, 0x05, 0x01, 0x01, 0x01])
    expect(slots[2]).toEqual([0x01, 0x07, 0x07, 0x05, 0x34, 0x6f, 0x14, 0x0c, 0x05, 0x02, 0x01, 0x01, 0x01])
  })

  it('encodeBank reconstrói byte a byte o bank real', () => {
    const slots = decodeBank(new Uint8Array(BANK_REAL))
    expect([...encodeBank(slots)]).toEqual(BANK_REAL)
  })

  it('liveParamAddress monta os endereços vivos por slot e campo', () => {
    // volume do A/B/C = 0x80000005 / 0x15 / 0x25; type do C = 0x80000029
    expect(liveParamAddress(0, 5)).toBe(0x80000005)
    expect(liveParamAddress(1, 5)).toBe(0x80000015)
    expect(liveParamAddress(2, 5)).toBe(0x80000025)
    expect(liveParamAddress(2, 9)).toBe(0x80000029)
  })

  it('rejeita slot ou campo fora do range', () => {
    expect(() => liveParamAddress(3, 0)).toThrow(/slot/)
    expect(() => liveParamAddress(0, 13)).toThrow(/offset/)
  })
})
