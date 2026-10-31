import { describe, it, expect } from 'vitest';
import { isFestival, datesFromHours, isOnNow, nextRun, formatRun, runFromPicks } from './festivalDates';

const on = (day) => new Date(`${day}T04:00:00Z`).getTime();

describe('festival dates, from the visiting hours', () => {
  it('knows a festival by its category, in any case', () => {
    expect(isFestival(['Religious', 'festivals'])).toBe(true);
    expect(isFestival(['Nature'])).toBe(false);
  });

  it('reads the line the way the backend does', () => {
    expect(datesFromHours('Celebrated on December 29 to 30')).toEqual([{ start: '2000-12-29', end: '2000-12-30', everyYear: true }]);
    expect(datesFromHours('Celebrated on January 31, 2027')).toEqual([{ start: '2027-01-31', end: '2027-01-31', everyYear: false }]);
    expect(datesFromHours('Celebrated on the last Sunday of January')).toEqual([]);
  });

  it('open on its days, every year when no year is given', () => {
    const runs = datesFromHours('Celebrated on May 14–15');
    expect(isOnNow(runs, on('2030-05-15'))).toBe(true);
    expect(isOnNow(runs, on('2030-05-16'))).toBe(false);
    expect(nextRun(runs, on('2030-05-16'))).toEqual({ start: '2031-05-14', end: '2031-05-15' });
  });

  it('a picked run: complete, and the last day not before the first', () => {
    expect(runFromPicks({ start: '2027-01-31', end: '2027-01-31' })).toEqual({ start: '2027-01-31', end: '2027-01-31', everyYear: false });
    expect(runFromPicks({ start: '2027-02-02', end: '2027-02-01' })).toBe(null);
    expect(runFromPicks({ start: '2027-01-31', end: '' })).toBe(null);
    expect(runFromPicks({ start: '2026-12-30', end: '2027-01-02', everyYear: true })).toEqual({ start: '2000-12-30', end: '2001-01-02', everyYear: true });
  });

  it('reads the way people write dates', () => {
    expect(formatRun({ start: '2027-05-14', end: '2027-05-15' })).toBe('May 14–15, 2027');
    expect(formatRun({ start: '2027-03-30', end: '2027-04-02' })).toBe('March 30 – April 2, 2027');
    expect(formatRun({ start: '2026-12-30', end: '2027-01-02' })).toBe('December 30, 2026 – January 2, 2027');
  });
});
