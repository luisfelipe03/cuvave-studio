import {
  ArrowClockwise,
  ArrowCounterClockwise,
  ArrowsLeftRight,
  FloppyDisk,
} from '@phosphor-icons/react'

interface TopBarProps {
  labels: string[]
  active: number
  dirty: boolean
  canUndo: boolean
  canRedo: boolean
  comparing: boolean
  canCompare: boolean
  status: string
  statusKind: 'ok' | 'busy' | 'error'
  onUndo: () => void
  onRedo: () => void
  onSave: () => void
  onCopy: (index: number) => void
  onCompare: () => void
}

const btn =
  'flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-raised px-3 text-[13px] text-ink transition-colors duration-200 enabled:hover:border-accent/50 disabled:opacity-40'

export function TopBar({
  labels,
  active,
  dirty,
  canUndo,
  canRedo,
  comparing,
  canCompare,
  status,
  statusKind,
  onUndo,
  onRedo,
  onSave,
  onCopy,
  onCompare,
}: TopBarProps) {
  const current = labels[active] ?? '—'
  const others = labels
    .map((label, index) => ({ label, index }))
    .filter((s) => s.index !== active)

  return (
    <header className="flex flex-wrap items-center gap-2 border-line border-b bg-panel px-4 py-2.5">
      <button type="button" className={btn} onClick={onUndo} disabled={!canUndo}>
        <ArrowCounterClockwise size={14} weight="bold" />
        Desfazer
      </button>
      <button type="button" className={btn} onClick={onRedo} disabled={!canRedo}>
        <ArrowClockwise size={14} weight="bold" />
        Refazer
      </button>

      <button
        type="button"
        onClick={onSave}
        disabled={!dirty}
        className="flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-accent/50 bg-accent/15 px-3.5 text-[13px] font-medium text-accent transition-colors duration-200 enabled:hover:bg-accent/25 disabled:opacity-40"
      >
        <FloppyDisk size={14} weight="bold" />
        Salvar {current}
      </button>

      <span className="ml-1 flex items-center gap-1.5">
        <span className="text-[11px] tracking-wide text-faint uppercase">
          Copiar para
        </span>
        {others.map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={() => onCopy(s.index)}
            title={`Copiar o preset ${current} para o ${s.label}`}
            className="h-9 w-9 cursor-pointer rounded-lg border border-line bg-raised font-mono text-[13px] text-ink transition-colors duration-200 hover:border-accent/50"
          >
            {s.label}
          </button>
        ))}
      </span>

      <button
        type="button"
        onClick={onCompare}
        disabled={!canCompare}
        title="Alterna entre o preset gravado e o que você editou"
        className={`flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-[13px] transition-colors duration-200 disabled:opacity-40 ${
          comparing
            ? 'border-accent bg-accent text-accent-ink'
            : 'border-line bg-raised text-ink enabled:hover:border-accent/50'
        }`}
      >
        <ArrowsLeftRight size={14} weight="bold" />
        {comparing ? 'Vendo o gravado' : 'Comparar'}
      </button>

      <span
        aria-live="polite"
        className={`ml-auto text-xs ${
          statusKind === 'error'
            ? 'text-danger'
            : statusKind === 'busy'
              ? 'text-accent'
              : 'text-dim'
        }`}
      >
        {status}
      </span>
    </header>
  )
}
