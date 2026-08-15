import { useCallback, useState } from 'react'
import type { DeviceProfile } from 'profiles'

export type DeviceStatus =
  | { kind: 'unsupported' }
  | { kind: 'idle' }
  | { kind: 'requesting' }
  | { kind: 'denied' }
  | { kind: 'disconnected' }
  | { kind: 'connected'; name: string }

/** Par de portas MIDI do pedal — o que o usePedal precisa pra falar. */
export interface PedalPorts {
  input: MIDIInput
  output: MIDIOutput
}

/**
 * Detecção do pedal via Web MIDI API.
 *
 * A permissão só é pedida quando `connect()` é chamado (ação explícita do
 * usuário, ex: botão "Conectar pedal") — nunca automaticamente ao carregar
 * a página. Além do status, expõe as portas reais (input+output) pra camada
 * de protocolo (usePedal) conversar com o pedal.
 */
export function useDevice(profile: DeviceProfile) {
  const [status, setStatus] = useState<DeviceStatus>(() =>
    typeof navigator.requestMIDIAccess === 'function'
      ? { kind: 'idle' }
      : { kind: 'unsupported' },
  )
  const [ports, setPorts] = useState<PedalPorts | null>(null)

  const scan = useCallback(
    (access: MIDIAccess) => {
      const outputs = Array.from(access.outputs.values())
      const inputs = Array.from(access.inputs.values())
      const output = outputs.find((p) => profile.detect.test(p.name ?? ''))
      const input = inputs.find((p) => profile.detect.test(p.name ?? ''))
      const name = output?.name ?? input?.name

      if (name && input && output) {
        setStatus({ kind: 'connected', name })
        setPorts({ input, output })
      } else {
        setStatus({ kind: 'disconnected' })
        setPorts(null)
      }
    },
    [profile],
  )

  const connect = useCallback(() => {
    if (typeof navigator.requestMIDIAccess !== 'function') {
      setStatus({ kind: 'unsupported' })
      return
    }
    setStatus({ kind: 'requesting' })
    navigator.requestMIDIAccess({ sysex: true }).then(
      (access) => {
        scan(access)
        access.onstatechange = () => scan(access)
      },
      () => setStatus({ kind: 'denied' }),
    )
  }, [scan])

  return { status, connect, ports }
}
