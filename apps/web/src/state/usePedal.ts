import { useCallback, useEffect, useRef, useState } from 'react'
import {
  BANK_ADDRESS,
  BANK_MEMORY,
  BANK_SIZE,
  buildSysEx,
  Cmd,
  decodeBank,
  encodeBank,
  isAck,
  liveParamAddress,
  parseReadResponse,
  parseSysEx,
  readMemory,
  writeMemory,
} from 'protocol'
import type { Frame } from 'protocol'
import type { PedalPorts } from './useDevice'

export type PedalLinkStatus = 'off' | 'busy' | 'ready' | 'error'

interface PedalLink {
  status: PedalLinkStatus
  error: string | null
  /** lê a imagem do bank (48 bytes) e devolve 3 slots de 13 campos */
  readBank: () => Promise<number[][] | null>
  /** escreve 1 byte num campo vivo (aplica no DSP na hora) */
  writeLive: (slot: number, offset: number, value: number) => void
  /** grava a imagem completa do bank — aplica no DSP E persiste na flash */
  saveBank: (slots: number[][]) => Promise<boolean>
}

const TIMEOUT_MS = 2000

/**
 * Sessão com o pedal: pedidos serializados (o pedal não responde bem a
 * rajadas), ACK checado, live writes com coalescência (arrastar um knob
 * gera dezenas de mudanças; só a última de cada campo importa).
 *
 * Baseado no fluxo oficial do CubeSuite (capturas 003/020 do
 * MrGariZack/cubecontrol): identidade antes de bursts, write vivo de 1 byte
 * pra aplicar, write do bank inteiro pra salvar+persistir.
 */
export function usePedal(ports: PedalPorts | null): PedalLink {
  const [status, setStatus] = useState<PedalLinkStatus>('off')
  const [error, setError] = useState<string | null>(null)
  const queueRef = useRef<Promise<unknown>>(Promise.resolve())
  const pendingLive = useRef(new Map<number, number>())
  const flushing = useRef(false)

  useEffect(() => {
    setStatus(ports ? 'ready' : 'off')
    setError(null)
    if (!ports) {
      pendingLive.current.clear()
    }
  }, [ports])

  /** Enfileira uma operação — nada roda em paralelo com o pedal. */
  const enqueue = useCallback(<T,>(fn: () => Promise<T>): Promise<T> => {
    const run = queueRef.current.then(fn, fn)
    queueRef.current = run.catch(() => undefined)
    return run
  }, [])

  /** Manda uma SysEx e devolve o frame de resposta com timeout. */
  const sendRaw = useCallback(
    (sysex: Uint8Array): Promise<Frame> => {
      if (!ports) return Promise.reject(new Error('pedal não conectado'))
      const { input, output } = ports
      return new Promise((resolve, reject) => {
        const timer = window.setTimeout(() => {
          input.removeEventListener('midimessage', onMessage)
          reject(new Error('sem resposta do pedal (timeout)'))
        }, TIMEOUT_MS)
        const onMessage = (e: MIDIMessageEvent) => {
          try {
            const frame = parseSysEx(new Uint8Array(e.data ?? []))
            clearTimeout(timer)
            input.removeEventListener('midimessage', onMessage)
            resolve(frame)
          } catch {
            // frame de outro fluxo ou corrompido: espera o próximo
          }
        }
        input.addEventListener('midimessage', onMessage)
        try {
          output.send(sysex)
        } catch (err) {
          clearTimeout(timer)
          input.removeEventListener('midimessage', onMessage)
          reject(err instanceof Error ? err : new Error('envio falhou'))
        }
      })
    },
    [ports],
  )

  /** Toda mensagem passa pela fila — uma requisição em voo por vez. */
  const send = useCallback(
    (sysex: Uint8Array): Promise<Frame> => enqueue(() => sendRaw(sysex)),
    [enqueue, sendRaw],
  )

  const handshake = useCallback(async () => {
    // Identidade antes de bursts — mesmo ritual do CubeSuite.
    await send(buildSysEx(Cmd.NameVersion, []))
  }, [send])

  const readBank = useCallback(async (): Promise<number[][] | null> => {
    if (!ports) return null
    try {
      setStatus('busy')
      await handshake()
      const frame = await send(readMemory(BANK_MEMORY, BANK_ADDRESS, BANK_SIZE))
      if (frame.type !== Cmd.ReadMemory)
        throw new Error('resposta de leitura inesperada')
      const { data } = parseReadResponse(frame)
      return decodeBank(data)
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'falha ao ler o bank')
      return null
    } finally {
      setStatus(ports ? 'ready' : 'off')
    }
  }, [ports, handshake, send])

  /** Descarta os ACKs enquanto o flush de lives roda. */
  const flushLive = useCallback(async () => {
    if (flushing.current || pendingLive.current.size === 0) return
    flushing.current = true
    try {
      while (pendingLive.current.size > 0) {
        const entries = Array.from(pendingLive.current.entries())
        pendingLive.current.clear()
        for (const [address, value] of entries) {
          const frame = await send(
            writeMemory(BANK_MEMORY, address, [value]),
          )
          if (!isAck(frame)) {
            setStatus('error')
            setError('pedal recusou a escrita ao vivo')
          }
        }
      }
      setStatus(ports ? 'ready' : 'off')
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'falha na escrita ao vivo')
    } finally {
      flushing.current = false
    }
  }, [ports, send])

  const writeLive = useCallback(
    (slot: number, offset: number, value: number) => {
      if (!ports) return
      pendingLive.current.set(liveParamAddress(slot, offset), value & 0xff)
      void flushLive()
    },
    [ports, flushLive],
  )

  const saveBank = useCallback(
    async (slots: number[][]): Promise<boolean> => {
      if (!ports) return false
      try {
        setStatus('busy')
        // Não deixa write vivo pendente passar por cima do save: esvazia a
        // fila de lives antes de gravar a imagem do bank.
        await flushLive()
        await handshake()
        const frame = await send(
          writeMemory(BANK_MEMORY, BANK_ADDRESS, encodeBank(slots)),
        )
        if (!isAck(frame)) throw new Error('pedal recusou a gravação')
        // Conferência: relê e compara (mesmo ritual do CubeSuite).
        const check = await send(readMemory(BANK_MEMORY, BANK_ADDRESS, BANK_SIZE))
        const { data } = parseReadResponse(check)
        const expected = encodeBank(slots)
        const equal =
          data.length === expected.length &&
          data.every((b, i) => b === expected[i])
        if (!equal) throw new Error('gravação não conferiu na releitura')
        setStatus('ready')
        setError(null)
        return true
      } catch (err) {
        setStatus('error')
        setError(err instanceof Error ? err.message : 'falha ao salvar')
        return false
      }
    },
    [ports, flushLive, handshake, send],
  )

  return { status, error, readBank, writeLive, saveBank }
}
