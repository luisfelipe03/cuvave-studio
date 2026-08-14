import type { Parameter } from 'profiles'

interface SlotSelectorProps {
  param: Parameter
  value: number
  onChange: (value: number) => void
}

/**
 * Seletor de parâmetros discretos (Preamp, IR Cab): fileira de posições
 * clicáveis com o nome da opção atual em destaque.
 */
export function SlotSelector({ param, value, onChange }: SlotSelectorProps) {
  const options = param.options ?? []
  const current = options.find((o) => o.value === value)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-medium tracking-wide text-dim uppercase">
          {param.label}
        </span>
        <span className="font-mono text-xs text-ink">{current?.label}</span>
      </div>
      <div
        role="radiogroup"
        aria-label={param.label}
        className="flex gap-1 rounded-lg border border-line bg-panel p-1"
      >
        {options.map((o) => {
          const selected = o.value === value
          return (
            <button
              key={o.value}
              role="radio"
              aria-checked={selected}
              title={o.label}
              onClick={() => onChange(o.value)}
              className={`h-8 flex-1 rounded-md text-xs font-medium transition-all duration-200 active:scale-[0.96] ${
                selected
                  ? 'bg-accent text-accent-ink shadow-soft'
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
