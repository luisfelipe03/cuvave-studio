import { useEffect, useState } from 'react'
import type { DeviceProfile } from 'profiles'

export type DeviceStatus =
  | { kind: 'unsupported' }
  | { kind: 'scanning' }
  | { kind: 'disconnected' }
  | { kind: 'connected'; name: string }

/**
 * Detecção do pedal via Web MIDI API.
 *
 * M1/M2: só identifica o dispositivo na lista de portas — ainda não fala o
 * protocolo (SysEx entra depois do dump de memória com o pedal físico).
 * Até lá o app opera em "modo demo" mesmo com o pedal conectado.
 */
export function useDevice(profile: DeviceProfile) {
  const [status, setStatus] = useState<DeviceStatus>({ kind: 'scanning' })

  useEffect(() => {
    let cancelled = false

    if (typeof navigator.requestMIDIAccess !== 'function') {
      setStatus({ kind: 'unsupported' })
      return
    }

    navigator.requestMIDIAccess({ sysex: true }).then(
      (access) => {
        if (cancelled) return
        const names = Array.from(access.outputs.values(), (p) => p.name ?? '')
        const match = names.find((n) => profile.detect.test(n))
        if (match) {
          setStatus({ kind: 'connected', name: match })
        } else {
          setStatus({ kind: 'disconnected' })
        }
      },
      () => {
        if (!cancelled) setStatus({ kind: 'unsupported' })
      },
    )

    return () => {
      cancelled = true
    }
  }, [profile])

  return status
}
