import { describe, it, expect } from 'vitest';
import { pageNumbers } from './pagination';

describe('pageNumbers', () => {
  it('shows every page when there are few', () => {
    expect(pageNumbers(1, 1)).toEqual([1]);
    expect(pageNumbers(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('keeps the ends and the neighbours, with gaps between', () => {
    expect(pageNumbers(1, 12)).toEqual([1, 2, 3, 4, null, 12]);
    expect(pageNumbers(6, 12)).toEqual([1, null, 5, 6, 7, null, 12]);
    expect(pageNumbers(12, 12)).toEqual([1, null, 9, 10, 11, 12]);
  });
});
