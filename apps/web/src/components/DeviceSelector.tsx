import { useState } from 'react'
import { CaretDown, Check } from '@phosphor-icons/react'
import type { DeviceProfile } from 'profiles'

interface ComingSoon {
  id: string
  name: string
}

/**
 * Pedais da família Cuvave/M-VAVE ainda sem profile implementado — listados
 * aqui só pra deixar a arquitetura de seleção visível e pronta, nunca no
 * pacote `profiles` (esse guarda apenas profiles reais e validados).
 */
const COMING_SOON: ComingSoon[] = [{ id: 'tank-g', name: 'Tank-G' }]

interface DeviceSelectorProps {
  active: DeviceProfile
  profiles: DeviceProfile[]
}

export function DeviceSelector({ active, profiles }: DeviceSelectorProps) {
  const [open, setOpen] = useState(false)
  const onlyOneProfile = profiles.length <= 1 && COMING_SOON.length === 0

  if (onlyOneProfile) {
    return (
      <span className="rounded-md border border-line px-2 py-0.5 font-mono text-[10px] text-dim">
        {active.name}
      </span>
    )
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-md border border-line px-2 py-0.5 font-mono text-[10px] text-dim transition-colors hover:border-accent/40 hover:text-ink"
      >
        {active.name}
        <CaretDown size={9} weight="bold" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 z-50 mt-1.5 w-44 rounded-lg border border-line bg-panel py-1 shadow-soft-lg">
            {profiles.map((p) => (
              <button
                key={p.id}
                onClick={() => setOpen(false)}
                className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs text-ink hover:bg-raised"
              >
                {p.name}
                {p.id === active.id && (
                  <Check size={12} weight="bold" className="text-accent" />
                )}
              </button>
            ))}
            {COMING_SOON.map((p) => (
              <div
                key={p.id}
                title="Perfil ainda não implementado"
                className="flex w-full items-center justify-between px-3 py-1.5 text-xs text-faint"
              >
                {p.name}
                <span className="text-[9px] tracking-wide uppercase">
                  em breve
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
