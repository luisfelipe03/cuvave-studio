import { useEffect, useRef, useState } from 'react'
import {
  ArrowSquareOut,
  Check,
  Eye,
  EyeSlash,
  Key,
  WarningCircle,
  X,
} from '@phosphor-icons/react'
import { DeepSeekError, validateKey } from '../lib/deepseek'

interface SettingsDialogProps {
  initialKey: string
  onSave: (key: string) => void
  onClose: () => void
}

type CheckState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'ok' }
  | { kind: 'error'; message: string }

export function SettingsDialog({
  initialKey,
  onSave,
  onClose,
}: SettingsDialogProps) {
  const [key, setKey] = useState(initialKey)
  const [visible, setVisible] = useState(false)
  const [check, setCheck] = useState<CheckState>({ kind: 'idle' })
  const dialogRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Foco entra no diálogo ao abrir e volta pro gatilho ao fechar; Tab fica
  // preso dentro enquanto ele estiver aberto (WCAG 2.4.3 / 2.1.2).
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null
    inputRef.current?.focus()
    inputRef.current?.select()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button, input, a[href]',
      )
      if (!focusables?.length) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      trigger?.focus?.()
    }
  }, [onClose])

  const runCheck = async () => {
    setCheck({ kind: 'checking' })
    try {
      await validateKey(key)
      setCheck({ kind: 'ok' })
    } catch (err) {
      setCheck({
        kind: 'error',
        message:
          err instanceof DeepSeekError
            ? err.message
            : 'Não deu pra validar a chave agora.',
      })
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="w-full max-w-md rounded-2xl border border-line bg-panel p-6 shadow-soft-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Key size={18} weight="bold" className="text-accent" />
            <h2
              id="settings-title"
              className="text-sm font-semibold tracking-wide uppercase"
            >
              Configurações
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar configurações"
            className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg text-dim transition-colors hover:bg-raised hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-5 flex flex-col gap-2">
          <label htmlFor="deepseek-key" className="text-xs font-medium text-dim">
            Chave da API DeepSeek
          </label>
          <div className="flex gap-2">
            <input
              id="deepseek-key"
              ref={inputRef}
              type={visible ? 'text' : 'password'}
              value={key}
              onChange={(e) => {
                setKey(e.target.value)
                setCheck({ kind: 'idle' })
              }}
              placeholder="sk-…"
              autoComplete="off"
              spellCheck={false}
              aria-describedby="key-help"
              className="h-11 min-w-0 flex-1 rounded-lg border border-line-strong bg-bg px-3.5 font-mono text-sm text-ink transition-colors placeholder:text-faint focus:border-accent"
            />
            <button
              type="button"
              onClick={() => setVisible((v) => !v)}
              aria-label={visible ? 'Ocultar chave' : 'Mostrar chave'}
              className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-line text-dim transition-colors hover:bg-raised hover:text-ink"
            >
              {visible ? <EyeSlash size={16} /> : <Eye size={16} />}
            </button>
          </div>

          <p id="key-help" className="text-xs leading-relaxed text-faint">
            Fica salva apenas neste navegador — nunca vai pro código nem pra um
            servidor.{' '}
            <a
              href="https://platform.deepseek.com/api_keys"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-dim underline underline-offset-2 transition-colors hover:text-ink"
            >
              Criar chave
              <ArrowSquareOut size={11} />
            </a>
          </p>

          <div aria-live="polite" className="min-h-9">
            {check.kind === 'ok' && (
              <p className="flex items-center gap-1.5 text-xs text-ok">
                <Check size={13} weight="bold" />
                Chave válida — a DeepSeek aceitou.
              </p>
            )}
            {check.kind === 'error' && (
              <p className="flex items-start gap-1.5 text-xs leading-relaxed text-danger">
                <WarningCircle size={13} weight="fill" className="mt-0.5 shrink-0" />
                {check.message}
              </p>
            )}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={runCheck}
            disabled={!key.trim() || check.kind === 'checking'}
            className="flex h-11 cursor-pointer items-center gap-2 rounded-lg border border-line px-4 text-sm font-medium text-dim transition-colors hover:text-ink disabled:opacity-45"
          >
            {check.kind === 'checking' ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-dim/30 border-t-dim" />
                Testando…
              </>
            ) : (
              'Testar chave'
            )}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="h-11 cursor-pointer rounded-lg px-4 text-sm font-medium text-dim transition-colors hover:text-ink"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => {
              onSave(key)
              onClose()
            }}
            className="h-11 cursor-pointer rounded-lg bg-accent px-5 text-sm font-semibold text-accent-ink transition-colors duration-200 hover:bg-accent-strong"
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  )
}
