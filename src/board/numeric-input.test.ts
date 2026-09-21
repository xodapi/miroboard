import { describe, expect, it } from 'vitest'
import { parseBounded, parseNumericInput } from './numeric-input'

describe('parseNumericInput', () => {
  it('reads a number', () => {
    expect(parseNumericInput('42')).toBe(42)
    expect(parseNumericInput('0.5')).toBe(0.5)
    expect(parseNumericInput('-3')).toBe(-3)
  })

  it('accepts a deliberate zero', () => {
    // The whole point of returning undefined for "nothing usable" is that zero
    // stays a real, writable value.
    expect(parseNumericInput('0')).toBe(0)
  })

  it('refuses an empty field rather than calling it zero', () => {
    // This is the bug the module exists for: Number('') is 0, and a number
    // input reports '' both when empty and when its contents cannot be parsed.
    expect(parseNumericInput('')).toBeUndefined()
    expect(parseNumericInput('   ')).toBeUndefined()
  })

  it('refuses text and non-finite values', () => {
    expect(parseNumericInput('abc')).toBeUndefined()
    expect(parseNumericInput('Infinity')).toBeUndefined()
    expect(parseNumericInput('NaN')).toBeUndefined()
  })
})

describe('parseBounded', () => {
  it('passes values inside the range', () => {
    expect(parseBounded('5', { min: 0, max: 10 })).toBe(5)
    expect(parseBounded('0', { min: 0, max: 10 })).toBe(0)
    expect(parseBounded('10', { min: 0, max: 10 })).toBe(10)
  })

  it('rejects values outside it rather than clamping', () => {
    // Clamping mid-keystroke rewrites what someone is typing; rejecting leaves
    // the last good value in place and lets them finish.
    expect(parseBounded('-1', { min: 0 })).toBeUndefined()
    expect(parseBounded('11', { max: 10 })).toBeUndefined()
  })

  it('rejects non-integers when asked for one', () => {
    expect(parseBounded('2.5', { integer: true })).toBeUndefined()
    expect(parseBounded('3', { integer: true })).toBe(3)
  })

  it('carries the empty and unparseable cases through', () => {
    expect(parseBounded('', { min: 0 })).toBeUndefined()
    expect(parseBounded('abc', { min: 0 })).toBeUndefined()
  })
})
