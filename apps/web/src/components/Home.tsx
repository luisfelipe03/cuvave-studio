import {
  ArrowRight,
  GithubLogo,
  Sparkle,
  Waveform,
  WarningCircle,
} from '@phosphor-icons/react'
import type { DeviceStatus } from '../state/useDevice'

const CHAIN = ['Tuner', 'Preamp', 'Phaser/Chorus', 'Delay', 'Reverb', 'IR Cab']

interface HomeProps {
  status: DeviceStatus
  onConnect: () => void
  onDemo: () => void
}

export function Home({ status, onConnect, onDemo }: HomeProps) {
  const unsupported = status.kind === 'unsupported'

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-2xl flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-8 flex h-11 w-11 items-center justify-center rounded-xl bg-accent/12">
        <Waveform size={22} weight="bold" className="text-accent" />
      </div>

      <h1 className="text-2xl font-semibold tracking-tight text-ink">
        Cuvave Studio
      </h1>
      <p className="mt-3 max-w-md text-[15px] leading-relaxed text-dim">
        Editor de presets pra pedaleiras da família Cuvave/M-VAVE — sem
        instalar nada. Conecta o pedal por USB, edita os parâmetros pelo
        navegador, e pede pra uma IA montar um preset a partir do nome de uma
        música.
      </p>

      {/* diagrama silencioso da cadeia — a mesma que fica ativa no editor */}
      <div className="mt-10 flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5">
        {CHAIN.map((step, i) => (
          <span key={step} className="flex items-center gap-2">
            {i > 0 && <span className="text-faint">→</span>}
            <span className="rounded-md border border-line px-2.5 py-1 font-mono text-[11px] text-faint">
              {step}
            </span>
          </span>
        ))}
      </div>

      <div className="mt-10 flex flex-col items-center gap-3">
        <button
          onClick={onConnect}
          disabled={unsupported}
          className="flex h-11 items-center gap-2 rounded-lg bg-accent px-5 text-sm font-semibold text-accent-ink transition-all duration-200 hover:bg-accent-strong active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Conectar pedal via USB
          <ArrowRight size={15} weight="bold" />
        </button>

        {unsupported ? (
          <span className="flex items-center gap-1.5 text-xs text-accent">
            <WarningCircle size={13} weight="fill" />
            Esse navegador não fala Web MIDI — abra em Chrome ou Edge
          </span>
        ) : status.kind === 'disconnected' ? (
          <span className="text-xs text-faint">
            Nenhum pedal encontrado nas portas MIDI — confira o cabo USB
          </span>
        ) : (
          <span className="text-xs text-faint">
            Chrome ou Edge vão pedir permissão de acesso a dispositivos MIDI
          </span>
        )}

        <button
          onClick={onDemo}
          className="mt-1 flex items-center gap-1.5 text-xs text-dim underline-offset-4 hover:text-ink hover:underline"
        >
          <Sparkle size={12} />
          Explorar sem pedal (modo demo)
        </button>
      </div>

      <a
        href="https://github.com/luisfelipe03/cuvave-studio"
        target="_blank"
        rel="noreferrer"
        className="mt-16 flex items-center gap-1.5 text-xs text-faint transition-colors hover:text-dim"
      >
        <GithubLogo size={13} />
        código aberto (GPL-3.0) — não afiliado à Cuvave/M-VAVE
      </a>
    </div>
  )
}
