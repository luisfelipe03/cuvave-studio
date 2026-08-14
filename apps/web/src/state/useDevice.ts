import { useCallback, useState } from 'react'
import type { DeviceProfile } from 'profiles'

export type DeviceStatus =
  | { kind: 'unsupported' }
  | { kind: 'idle' }
  | { kind: 'requesting' }
  | { kind: 'denied' }
  | { kind: 'disconnected' }
  | { kind: 'connected'; name: string }

/**
 * Detecção do pedal via Web MIDI API.
 *
 * A permissão só é pedida quando `connect()` é chamado (ação explícita do
 * usuário, ex: botão "Conectar pedal") — nunca automaticamente ao carregar
 * a página.
 *
 * M1/M2: só identifica o dispositivo na lista de portas — ainda não fala o
 * protocolo (SysEx entra depois do dump de memória com o pedal físico).
 */
export function useDevice(profile: DeviceProfile) {
  const [status, setStatus] = useState<DeviceStatus>(() =>
    typeof navigator.requestMIDIAccess === 'function'
      ? { kind: 'idle' }
      : { kind: 'unsupported' },
  )

  const scan = useCallback(
    (access: MIDIAccess) => {
      const names = Array.from(access.outputs.values(), (p) => p.name ?? '')
      const match = names.find((n) => profile.detect.test(n))
      setStatus(
        match ? { kind: 'connected', name: match } : { kind: 'disconnected' },
      )
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

  return { status, connect }
}
