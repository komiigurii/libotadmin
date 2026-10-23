import { describe, it, expect } from 'vitest';
import { parseEntranceFee, formatEntranceFee, entranceFeeProblem, cleanFeeAmount } from './entranceFee';

describe('entrance fee', () => {
  it('reads what spots already have', () => {
    expect(parseEntranceFee('Free')).toEqual({ kind: 'free', amount: '' });
    expect(parseEntranceFee('free entrance')).toEqual({ kind: 'free', amount: '' });
    expect(parseEntranceFee('No entrance fee')).toEqual({ kind: 'free', amount: '' });
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
    expect(entranceFeeProblem('paid', '50')).toBe('');
    expect(entranceFeeProblem('paid', '12.50')).toBe('');
    expect(entranceFeeProblem('free', '')).toBe('');
  });

  it('takes only an amount over ₱0 for a paid entrance', () => {
    expect(entranceFeeProblem('paid', '0')).toMatch(/more than ₱0/);
    expect(entranceFeeProblem('paid', '0.00')).toMatch(/more than ₱0/);
    expect(entranceFeeProblem('paid', '-1')).toMatch(/number of pesos/);
    expect(entranceFeeProblem('paid', 'fifty')).toMatch(/number of pesos/);
    expect(entranceFeeProblem('paid', '1.234')).toMatch(/number of pesos/);
  });

  it('lets an older spot keep its written-out prices until they change', () => {
    const saved = '₱20 adults, ₱10 kids';
    expect(entranceFeeProblem('paid', saved, saved)).toBe('');
    expect(entranceFeeProblem('paid', '₱20 adults', saved)).toMatch(/number of pesos/);
    expect(entranceFeeProblem('paid', '-1', '-1')).toMatch(/number of pesos/);
  });

  it('lets only digits and one decimal point be typed', () => {
    expect(cleanFeeAmount('-1')).toBe('1');
    expect(cleanFeeAmount('₱50')).toBe('50');
    expect(cleanFeeAmount('1.2.3')).toBe('1.23');
    expect(cleanFeeAmount('12.345')).toBe('12.34');
    expect(cleanFeeAmount('abc')).toBe('');
    expect(cleanFeeAmount(undefined)).toBe('');
  });
});
