import { describe, it, expect } from 'vitest';
import { fmtVal, changedFieldLabels } from './changeDiff';

describe('AR positions in a change', () => {
  it('show what is at each position and its fact', () => {
    const text = fmtVal('modelsCoordinates', [
      { label: 'Bell tower', lat: 14.8466, lng: 120.8125, trivia: 'The bell tower was added later.' },
      { label: 'Model', lat: 14.8467, lng: 120.8126 },
    ]);
    expect(text).toBe(
      '#1  Bell tower  14.846600, 120.812500\n    “The bell tower was added later.”\n' +
      '#2  14.846700, 120.812600'
    );
  });

  it('a changed fact alone counts as a change to the AR positions', () => {
    const pin = { label: 'Facade', lat: 14.8, lng: 120.8 };
    const record = {
      modelsCoordinates: [{ ...pin, trivia: 'Old fact.' }],
      pendingChange: { modelsCoordinates: [{ ...pin, trivia: 'New fact.' }] },
    };
    expect(changedFieldLabels(record)).toEqual(['ar positions']);
  });
});
