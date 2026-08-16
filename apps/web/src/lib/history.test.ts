import { describe, expect, it } from 'vitest'
import { canRedo, canUndo, initHistory, push, redo, undo } from './history'

describe('history', () => {
  it('começa sem nada pra desfazer nem refazer', () => {
    const h = initHistory('a')
    expect(h.present).toBe('a')
    expect(canUndo(h)).toBe(false)
    expect(canRedo(h)).toBe(false)
  })

  it('desfaz voltando ao valor anterior', () => {
    const h = push(initHistory('a'), 'b')
    expect(h.present).toBe('b')
    expect(canUndo(h)).toBe(true)

    const back = undo(h)
    expect(back.present).toBe('a')
    expect(canUndo(back)).toBe(false)
    expect(canRedo(back)).toBe(true)
  })

  it('refaz o que foi desfeito', () => {
    const h = redo(undo(push(initHistory('a'), 'b')))
    expect(h.present).toBe('b')
    expect(canRedo(h)).toBe(false)
  })

  it('descarta o futuro quando algo novo é feito depois de desfazer', () => {
    const h = push(undo(push(initHistory('a'), 'b')), 'c')
    expect(h.present).toBe('c')
    expect(canRedo(h)).toBe(false)
    expect(undo(h).present).toBe('a')
  })

  it('desfazer e refazer no vazio não quebram nem mudam o presente', () => {
    const h = initHistory('a')
    expect(undo(h)).toBe(h)
    expect(redo(h)).toBe(h)
  })

  it('não empilha quando o valor não mudou', () => {
    const h = push(initHistory('a'), 'a')
    expect(canUndo(h)).toBe(false)
  })

  it('esquece o passado mais antigo além do limite', () => {
    let h = initHistory(0)
    for (let i = 1; i <= 60; i++) h = push(h, i)
    expect(h.past.length).toBe(50)
    // o mais antigo retido é o 10 (os 0–9 caíram fora)
    expect(h.past[0]).toBe(10)
  })
})
