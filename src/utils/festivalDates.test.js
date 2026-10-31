import { describe, it, expect } from 'vitest';
import { isFestival, isOnNow, nextRun, festivalDatesProblem, formatRun } from './festivalDates';
import { fmtVal } from './changeDiff';

const on = (day) => new Date(`${day}T04:00:00Z`).getTime();

describe('festival dates', () => {
  it('knows a festival by its category, in any case', () => {
    expect(isFestival(['Religious', 'festivals'])).toBe(true);
    expect(isFestival(['Nature'])).toBe(false);
  });

  it('open on its days, every year when it repeats', () => {
    const runs = [{ start: '2026-05-14', end: '2026-05-15', everyYear: true }];
    expect(isOnNow(runs, on('2030-05-15'))).toBe(true);
    expect(isOnNow(runs, on('2030-05-16'))).toBe(false);
    expect(nextRun(runs, on('2030-05-16'))).toEqual({ start: '2031-05-14', end: '2031-05-15' });
  });

  it('asks for dates, and real ones', () => {
    expect(festivalDatesProblem([])).toMatch(/dates/);
    expect(festivalDatesProblem([{ start: '2027-01-31', end: '' }])).toMatch(/first and last day/);
    expect(festivalDatesProblem([{ start: '2027-02-02', end: '2027-02-01' }])).toMatch(/before the first/);
    expect(festivalDatesProblem([{ start: '2027-01-31', end: '2027-01-31' }])).toBe('');
  });

  it('reads the way people write dates', () => {
    expect(formatRun({ start: '2027-05-14', end: '2027-05-15' })).toBe('May 14–15, 2027');
    expect(formatRun({ start: '2027-01-31', end: '2027-01-31' })).toBe('January 31, 2027');
    expect(formatRun({ start: '2027-03-30', end: '2027-04-02' })).toBe('March 30 – April 2, 2027');
    expect(formatRun({ start: '2026-12-30', end: '2027-01-02' })).toBe('December 30, 2026 – January 2, 2027');
    expect(fmtVal('festivalDates', [{ start: '2026-06-23', end: '2026-06-23', everyYear: true }])).toBe('June 23, every year');
  });
});
