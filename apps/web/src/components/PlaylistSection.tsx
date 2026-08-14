import { useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  CaretDown,
  Check,
  CheckCircle,
  PencilSimple,
  Queue,
  Trash,
} from '@phosphor-icons/react'
import type { DeviceProfile, PresetValues } from 'profiles'
import type { LibraryEntry, Playlist } from '../lib/storage'
import type { PlaylistsState } from '../state/usePlaylists'

interface PlaylistSectionProps {
  profile: DeviceProfile
  library: LibraryEntry[]
  playlists: PlaylistsState
  onApply: (slot: number, values: PresetValues) => void
}

function resolveEntries(
  playlist: Playlist,
  library: LibraryEntry[],
): LibraryEntry[] {
  const byId = new Map(library.map((e) => [e.id, e]))
  return playlist.entryIds
    .map((id) => byId.get(id))
    .filter((e): e is LibraryEntry => Boolean(e))
}

export function PlaylistSection({
  profile,
  library,
  playlists,
  onApply,
}: PlaylistSectionProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [applied, setApplied] = useState<string | null>(null)

  const apply = (playlist: Playlist) => {
    const entries = resolveEntries(playlist, library)
    entries.slice(0, profile.presetCount).forEach((entry, i) => {
      onApply(i, entry.values)
    })
    const slots = profile.presetLabels
      .slice(0, Math.min(entries.length, profile.presetCount))
      .join('/')
    setApplied(
      entries.length === 0
        ? `${playlist.name}: vazia — nada pra gravar`
        : `${playlist.name} gravada nos slots ${slots}`,
    )
    window.setTimeout(() => setApplied(null), 3000)
  }

  return (
    <div className="flex flex-col gap-2 border-t border-line pt-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-dim uppercase">
          <Queue size={13} weight="bold" className="text-accent" />
          Playlists
        </h3>
        {playlists.playlists.length > 0 && (
          <span className="tabular font-mono text-[10px] text-faint">
            {playlists.playlists.length}
          </span>
        )}
      </div>

      <div aria-live="polite">
        {applied && (
          <p className="flex items-center gap-1.5 text-xs text-ok">
            <CheckCircle size={13} weight="fill" />
            {applied}
          </p>
        )}
      </div>

      {playlists.playlists.length === 0 ? (
        <p className="text-xs leading-relaxed text-faint">
          Monte uma lista de presets da biblioteca pra gravar no pedal num
          clique — os {profile.presetCount} primeiros entram nos slots{' '}
          {profile.presetLabels.join('/')} na ordem da lista.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {playlists.playlists.map((playlist) => {
            const expanded = expandedId === playlist.id
            const entries = resolveEntries(playlist, library)
            const available = library.filter(
              (e) => !playlist.entryIds.includes(e.id),
            )
            return (
              <li
                key={playlist.id}
                className={`overflow-hidden rounded-lg border bg-bg/40 transition-colors ${
                  expanded ? 'border-accent/40' : 'border-line'
                }`}
              >
                <div className="flex items-center gap-1 p-2 pl-3">
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : playlist.id)}
                    aria-expanded={expanded}
                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
                  >
                    {renamingId === playlist.id ? (
                      <input
                        autoFocus
                        defaultValue={playlist.name}
                        onClick={(e) => e.stopPropagation()}
                        onBlur={(e) => {
                          playlists.rename(playlist.id, e.target.value)
                          setRenamingId(null)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter')
                            (e.target as HTMLInputElement).blur()
                          if (e.key === 'Escape') setRenamingId(null)
                        }}
                        className="h-7 min-w-0 flex-1 rounded-md border border-line-strong bg-bg px-2 text-xs text-ink focus:border-accent focus:outline-none"
                      />
                    ) : (
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium text-ink">
                          {playlist.name}
                        </span>
                        <span className="block text-[10px] text-faint">
                          {entries.length}{' '}
                          {entries.length === 1 ? 'preset' : 'presets'}
                        </span>
                      </span>
                    )}
                    <CaretDown
                      size={12}
                      weight="bold"
                      className={`shrink-0 text-dim transition-transform duration-200 ${
                        expanded ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setRenamingId(renamingId === playlist.id ? null : playlist.id)
                    }
                    aria-label={`Renomear ${playlist.name}`}
                    className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-faint transition-colors hover:bg-raised hover:text-ink"
                  >
                    <PencilSimple size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => apply(playlist)}
                    disabled={entries.length === 0}
                    title="Grava os primeiros presets nos slots A/B/C"
                    className="flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 text-[11px] font-medium text-accent transition-colors hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <Check size={12} weight="bold" />
                    Aplicar
                  </button>
                  <button
                    type="button"
                    onClick={() => playlists.remove(playlist.id)}
                    aria-label={`Excluir ${playlist.name}`}
                    className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-faint transition-colors hover:text-danger"
                  >
                    <Trash size={12} />
                  </button>
                </div>

                {expanded && (
                  <div className="flex flex-col gap-2 px-3 pb-3">
                    {entries.length === 0 ? (
                      <p className="text-[11px] text-faint">
                        Vazia — adicione presets da biblioteca abaixo.
                      </p>
                    ) : (
                      <ol className="flex flex-col gap-1">
                        {entries.map((entry, i) => (
                          <li
                            key={entry.id}
                            className="flex items-center gap-2 rounded-md border border-line bg-panel px-2.5 py-1.5"
                          >
                            <span className="w-5 shrink-0 font-mono text-[10px] text-faint">
                              {i + 1}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-xs text-ink">
                              {entry.song}
                            </span>
                            <button
                              type="button"
                              disabled={i === 0}
                              onClick={() =>
                                playlists.moveEntry(playlist.id, entry.id, -1)
                              }
                              aria-label="Mover pra cima"
                              className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded text-faint transition-colors hover:text-ink disabled:opacity-30"
                            >
                              <ArrowUp size={11} weight="bold" />
                            </button>
                            <button
                              type="button"
                              disabled={i === entries.length - 1}
                              onClick={() =>
                                playlists.moveEntry(playlist.id, entry.id, 1)
                              }
                              aria-label="Mover pra baixo"
                              className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded text-faint transition-colors hover:text-ink disabled:opacity-30"
                            >
                              <ArrowDown size={11} weight="bold" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                playlists.removeEntry(playlist.id, entry.id)
                              }
                              aria-label={`Remover ${entry.song}`}
                              className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded text-faint transition-colors hover:text-danger"
                            >
                              <Trash size={11} />
                            </button>
                          </li>
                        ))}
                      </ol>
                    )}

                    {available.length > 0 && (
                      <select
                        value=""
                        aria-label={`Adicionar preset em ${playlist.name}`}
                        onChange={(e) => {
                          if (!e.target.value) return
                          playlists.addEntry(playlist.id, e.target.value)
                          e.target.value = ''
                        }}
                        className="h-9 rounded-md border border-line bg-bg px-2 text-xs text-dim focus:border-accent focus:outline-none"
                      >
                        <option value="" disabled>
                          Adicionar preset da biblioteca…
                        </option>
                        {available.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.song}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <button
        type="button"
        onClick={() => {
          const id = playlists.create()
          setExpandedId(id)
        }}
        className="self-start text-xs font-medium text-dim transition-colors hover:text-ink hover:underline"
      >
        + Nova playlist
      </button>
    </div>
  )
}
