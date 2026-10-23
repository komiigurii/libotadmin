import { describe, it, expect } from 'vitest';
import { insideBoundary, inRing } from './geo';

// A 1 km square near Malolos, as a town outline.
const square = [[120.80, 14.84], [120.81, 14.84], [120.81, 14.85], [120.80, 14.85], [120.80, 14.84]];
const town = { outer: [square], inner: [] };

describe('town outlines', () => {
  it('inside, outside, and the 50 m edge', () => {
    expect(inRing(120.805, 14.845, square)).toBe(true);
    expect(insideBoundary(town, 14.845, 120.805)).toBe(true);
    expect(insideBoundary(town, 14.86, 120.805)).toBe(false);
    // ~30 m north of the top edge counts; ~100 m doesn't.
    expect(insideBoundary(town, 14.85027, 120.805)).toBe(true);
    expect(insideBoundary(town, 14.8509, 120.805)).toBe(false);
  });

  it('holds nothing when there is no outline or no pin', () => {
    expect(insideBoundary(null, 0, 0)).toBe(true);
    expect(insideBoundary(town, '', '')).toBe(true);
  });
});
