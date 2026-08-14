import type { Tuning } from '../lib/deepseek'
import { STANDARD_TUNING } from '../lib/deepseek'

/**
 * Ícone SVG de afinação: 6 cordas verticais (grossura decrescente da 6ª à
 * 1ª) com a nota de cada uma. Cordas que mudam em relação ao padrão
 * (EADGBE) ganham destaque em âmbar — Drop D, Eb standard etc. pulam no
 * olho. Sem serviços de imagem: é SVG puro, nítido e acessível.
 */
export function TuningIcon({ tuning }: { tuning: Tuning }) {
  const notes = tuning.notes
  const isStandard = notes.every(
    (n, i) => n === STANDARD_TUNING.notes[i],
  )

  // grossura visual das cordas, da mais grave (6ª) à mais fina (1ª)
  const widths = [3.4, 2.9, 2.4, 1.9, 1.5, 1.1]
  const step = 13
  const xs = notes.map((_, i) => 10 + i * step)

  return (
    <svg
      width={10 + step * 5 + 10}
      height={34}
      viewBox={`0 0 ${10 + step * 5 + 10} 34`}
      role="img"
      aria-label={`Afinação ${tuning.name}: ${notes.join(' ')}`}
      className="shrink-0"
    >
      {notes.map((note, i) => (
        <g key={i}>
          <line
            x1={xs[i]}
            y1={3}
            x2={xs[i]}
            y2={17}
            stroke="var(--color-ink)"
            strokeWidth={widths[i]}
            strokeLinecap="round"
          />
          <text
            x={xs[i]}
            y={30}
            textAnchor="middle"
            fontSize={10}
            fontWeight={600}
            fill={
              isStandard || note === STANDARD_TUNING.notes[i]
                ? 'var(--color-dim)'
                : 'var(--color-accent)'
            }
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {note}
          </text>
        </g>
      ))}
    </svg>
  )
}
