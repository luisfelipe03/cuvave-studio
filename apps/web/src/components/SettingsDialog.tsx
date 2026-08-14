import { useEffect, useState } from 'react'
import { Key, X } from '@phosphor-icons/react'

interface SettingsDialogProps {
  initialKey: string
  onSave: (key: string) => void
  onClose: () => void
}

export function SettingsDialog({
  initialKey,
  onSave,
  onClose,
}: SettingsDialogProps) {
  const [key, setKey] = useState(initialKey)

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Configurações"
        className="w-full max-w-md rounded-2xl border border-line bg-panel p-6 shadow-soft-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Key size={18} weight="bold" className="text-accent" />
            <h2 className="text-sm font-semibold tracking-wide uppercase">
              Configurações
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-md p-1.5 text-dim transition-colors hover:bg-raised hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>

        <label className="mt-6 flex flex-col gap-2">
          <span className="text-xs font-medium text-dim">
            API key da DeepSeek
          </span>
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="sk-…"
            autoComplete="off"
            className="h-11 rounded-lg border border-line bg-bg px-3.5 font-mono text-sm text-ink placeholder:text-faint focus:border-accent/50 focus:outline-none"
          />
          <span className="text-xs leading-relaxed text-faint">
            Fica salva apenas neste navegador (localStorage) — nunca vai pro
            código nem pro servidor. Crie a sua em platform.deepseek.com.
          </span>
        </label>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="h-10 rounded-lg border border-line px-4 text-sm font-medium text-dim transition-colors hover:text-ink"
          >
            Cancelar
          </button>
          <button
            onClick={() => {
              onSave(key)
              onClose()
            }}
            className="h-10 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-ink transition-all duration-200 hover:bg-accent-strong active:scale-[0.97]"
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  )
}
