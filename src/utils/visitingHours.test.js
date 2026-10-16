import { describe, it, expect } from 'vitest';
import { formatHours, parseHours, formatDays, formatTime, ANYTIME_TEXT, DAYS } from './visitingHours';

describe('visiting hours: from pickers to the line the app shows', () => {
  it('writes times and days the way the existing spots read', () => {
    expect(formatHours({ kind: 'weekly', days: DAYS.slice(1), ranges: [{ start: 480, end: 960 }] }))
      .toBe('8:00 a.m. to 4:00 p.m., Tuesday to Sunday');
    expect(formatHours({ kind: 'weekly', days: ['Sunday'], ranges: [{ start: 480, end: 630 }, { start: 1020, end: 1080 }] }))
      .toBe('8:00 a.m. to 10:30 a.m. and 5:00 p.m. to 6:00 p.m., Every Sunday');
    expect(formatHours({ kind: 'anytime' })).toBe(ANYTIME_TEXT);
    expect(formatHours({ kind: 'dates', text: ' Celebrated on June 23 ' })).toBe('Celebrated on June 23');
  });

  it('is empty while incomplete, so the required check catches it', () => {
    expect(formatHours({ kind: 'weekly', days: [], ranges: [{ start: 480, end: 960 }] })).toBe('');
    expect(formatHours({ kind: 'weekly', days: DAYS, ranges: [{ start: 960, end: 480 }] })).toBe('');
    expect(formatHours({ kind: 'dates', text: '  ' })).toBe('');
  });

  it('names days in plain words', () => {
    expect(formatDays(DAYS)).toBe('Everyday');
    expect(formatDays(DAYS.slice(0, 5))).toBe('Monday to Friday');
    expect(formatDays(['Monday', 'Wednesday', 'Friday'])).toBe('Monday, Wednesday and Friday');
    expect(formatTime(0)).toBe('12:00 a.m.');
    expect(formatTime(750)).toBe('12:30 p.m.');
  });
});

describe('visiting hours: an existing line read back into the pickers', () => {
  it('reads the live spots\' weekly hours', () => {
    expect(parseHours('8:00 a.m. to 4:00 p.m., Tuesday to Sunday'))
      .toMatchObject({ kind: 'weekly', days: DAYS.slice(1), ranges: [{ start: 480, end: 960 }] });
    expect(parseHours('6:00 a.m. to 6:00 p.m, Everyday')).toMatchObject({ kind: 'weekly', days: DAYS });
    expect(parseHours('6:00 a.m. to 7:00 p.m, week days')).toMatchObject({ days: DAYS.slice(0, 5) });
    expect(parseHours('8:00 a.m. to 10:30 a.m. and 5:00 p.m. to 6:00 p.m., Every Sunday'))
      .toMatchObject({ days: ['Sunday'], ranges: [{ start: 480, end: 630 }, { start: 1020, end: 1080 }] });
  });

  it('reads "anytime", and keeps festivals and odd lines word for word', () => {
    expect(parseHours('Free to visit anytime and any day').kind).toBe('anytime');
    expect(parseHours('Anytime').kind).toBe('anytime');
    expect(parseHours('Celebrated on the last Sunday of January'))
      .toMatchObject({ kind: 'dates', text: 'Celebrated on the last Sunday of January' });
    expect(parseHours('Every second week of September in Malolos').kind).toBe('dates');
  });

  it('round-trips: read, then written, gives the same hours', () => {
    for (const line of ['9:00 a.m. to 4:00 p.m., Tuesday to Sunday', '8:00 a.m. to 5:00 p.m., Monday to Friday']) {
      expect(formatHours(parseHours(line))).toBe(line);
    }
  });
});
