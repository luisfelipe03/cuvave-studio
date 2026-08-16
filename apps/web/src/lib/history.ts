/**
 * Pilha de desfazer/refazer, pura e genérica.
 *
 * Fica fora do hook de propósito: o estado dos presets é um hook do React
 * (não testável aqui, o projeto não tem testing-library), mas a regra de
 * quando empilhar, quando limpar o futuro e quanto lembrar é lógica de
 * verdade — e essa dá pra testar.
 */

/** Quantos passos de volta guardamos. Editar knob gera muito evento. */
const LIMIT = 50

export interface History<T> {
  past: T[]
  present: T
  future: T[]
}

export function initHistory<T>(present: T): History<T> {
  return { past: [], present, future: [] }
}

export function canUndo<T>(h: History<T>): boolean {
  return h.past.length > 0
}

export function canRedo<T>(h: History<T>): boolean {
  return h.future.length > 0
}

/**
 * Registra um novo presente. Descarta o futuro — depois de desfazer e
 * editar de novo, o caminho antigo deixou de existir.
 */
export function push<T>(h: History<T>, next: T): History<T> {
  if (Object.is(next, h.present)) return h
  const past = [...h.past, h.present]
  return {
    past: past.length > LIMIT ? past.slice(past.length - LIMIT) : past,
    present: next,
    future: [],
  }
}

export function undo<T>(h: History<T>): History<T> {
  if (!canUndo(h)) return h
  return {
    past: h.past.slice(0, -1),
    present: h.past[h.past.length - 1],
    future: [h.present, ...h.future],
  }
}

export function redo<T>(h: History<T>): History<T> {
  if (!canRedo(h)) return h
  return {
    past: [...h.past, h.present],
    present: h.future[0],
    future: h.future.slice(1),
  }
}
