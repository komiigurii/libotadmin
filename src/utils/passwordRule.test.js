import { describe, it, expect } from 'vitest';
import { passwordProblem, passwordChecks, usernameProblem } from './passwordRule';

// The same cases as the server's tests (LibotBackend tests/accounts.test.js and
// tests/qaPanel20261017.test.js), so the two copies of the rule stay together.
describe('passwordProblem', () => {
  it('needs a letter, a number and a special character', () => {
    for (const bad of ['abcdefg1', 'abcdefg!', '12345678!', 'abcde-1', ' padded-pass-1', 'Password123']) {
      expect(passwordProblem(bad), bad).not.toBe('');
    }
    for (const good of ['abcdef-1', 'Malolos#2026x', 'long-enough-pass-1']) {
      expect(passwordProblem(good), good).toBe('');
    }
  });

  it('refuses the username inside it and the common ones', () => {
    expect(passwordProblem('baliwagmod#1', 'baliwagmod')).toMatch(/username/);
    expect(passwordProblem('P@ssw0rd1')).toMatch(/easy to guess/);
  });
});

describe('passwordChecks', () => {
  it('ticks each rule as it is met', () => {
    const ok = Object.fromEntries(passwordChecks('abc1', 'mod').map((c) => [c.key, c.ok]));
    expect(ok).toEqual({ length: false, letter: true, number: true, special: false, user: true });
    expect(passwordChecks('Baliwag-River-7', 'baliwagmod').every((c) => c.ok)).toBe(true);
  });
});

describe('usernameProblem', () => {
  it('keeps the server’s username rules', () => {
    for (const bad of ['ab', '1malolos', 'malolos.', 'malolos..mod', 'admin', 'superadmin', 'a b']) {
      expect(usernameProblem(bad), bad).not.toBe('');
    }
    expect(usernameProblem('baliwagmod')).toBe('');
  });
});
