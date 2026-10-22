import { describe, it, expect } from 'vitest';
import { parseEntranceFee, formatEntranceFee, entranceFeeProblem } from './entranceFee';

describe('entrance fee', () => {
  it('reads what spots already have', () => {
    expect(parseEntranceFee('Free')).toEqual({ kind: 'free', amount: '' });
    expect(parseEntranceFee('free entrance')).toEqual({ kind: 'free', amount: '' });
    expect(parseEntranceFee('₱50')).toEqual({ kind: 'paid', amount: '50' });
    expect(parseEntranceFee('PHP 1,200')).toEqual({ kind: 'paid', amount: '1200' });
    expect(parseEntranceFee('100 pesos')).toEqual({ kind: 'paid', amount: '100' });
    expect(parseEntranceFee('')).toEqual({ kind: '', amount: '' });
  });

  it('keeps text it can’t read as an amount, so nothing is lost', () => {
    expect(parseEntranceFee('₱20 adults, ₱10 kids')).toEqual({ kind: 'paid', amount: '₱20 adults, ₱10 kids' });
    expect(formatEntranceFee('paid', '₱20 adults, ₱10 kids')).toBe('₱20 adults, ₱10 kids');
  });

  it('saves the same one line as before', () => {
    expect(formatEntranceFee('free', '')).toBe('Free');
    expect(formatEntranceFee('paid', '50')).toBe('₱50');
    expect(formatEntranceFee('paid', '1,200')).toBe('₱1200');
    expect(formatEntranceFee('', '')).toBe('');
  });

  it('says what’s missing', () => {
    expect(entranceFeeProblem('', '')).toMatch(/free or paid/);
    expect(entranceFeeProblem('paid', '')).toMatch(/how much/);
    expect(entranceFeeProblem('paid', '0')).toMatch(/Choose Free/);
    expect(entranceFeeProblem('paid', '50')).toBe('');
    expect(entranceFeeProblem('free', '')).toBe('');
  });
});
