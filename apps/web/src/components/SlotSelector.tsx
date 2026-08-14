import { useRef } from 'react'
import type { Parameter } from 'profiles'

interface SlotSelectorProps {
  param: Parameter
  value: number
  onChange: (value: number) => void
}

/**
 * Seletor de parâmetros discretos (Preamp, IR Cab): fileira de posições
 * numeradas — espelha os slots do knob físico — com o nome da opção atual
 * sempre visível, já que o número sozinho não diz nada.
 */
export function SlotSelector({ param, value, onChange }: SlotSelectorProps) {
  const options = param.options ?? []
  const current = options.find((o) => o.value === value)
  const groupRef = useRef<HTMLDivElement>(null)

  // Padrão de radiogroup: setas movem a seleção e o foco (roving tabindex).
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const idx = options.findIndex((o) => o.value === value)
    if (idx < 0) return
    let next: number | null = null
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown')
      next = (idx + 1) % options.length
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp')
      next = (idx - 1 + options.length) % options.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = options.length - 1
    if (next === null) return
    e.preventDefault()
    onChange(options[next].value)
    const buttons = groupRef.current?.querySelectorAll('button')
    buttons?.[next]?.focus()
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span
          id={`slot-label-${param.id}`}
          className="text-[11px] font-medium tracking-wide text-dim uppercase"
        >
          {param.label}
        </span>
        <span className="truncate font-mono text-xs text-ink">
          {current?.label}
        </span>
      </div>
      <div
        ref={groupRef}
        role="radiogroup"
        aria-labelledby={`slot-label-${param.id}`}
        onKeyDown={onKeyDown}
        className="grid grid-cols-9 gap-1 rounded-lg border border-line bg-panel p-1"
      >
        {options.map((o) => {
          const selected = o.value === value
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`${o.value} — ${o.label}`}
              tabIndex={selected ? 0 : -1}
              title={o.label}
              onClick={() => onChange(o.value)}
              className={`tabular flex h-11 cursor-pointer items-center justify-center rounded-md font-mono text-xs font-medium transition-colors duration-200 ${
                selected
                  ? 'bg-accent text-accent-ink'
                  : 'text-dim hover:bg-raised hover:text-ink'
              }`}
            >
              {o.value}
            </button>
          )
        })}
      </div>
    </div>
  )
}
