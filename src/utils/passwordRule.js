/*
 * The rules for staff usernames and passwords — the same as the server's
 * utils/passwordRule.js in LibotBackend, so a mistake shows before sending.
 * Keep the two the same.
 *
 * Mock defense 2026-10-21: a password needs a special character too.
 */

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

export const RESERVED_USERNAMES = new Set([
  'admin', 'administrator', 'moderator', 'mod', 'root', 'system', 'support', 'libot', 'libotbulacan',
  'superadmin', 'super-admin', 'super.admin', 'super_admin',
]);

const COMMON_PASSWORDS = new Set([
  'password1', 'password12', 'password123', 'passw0rd', 'p@ssw0rd', 'p@ssword1', 'p@ssw0rd1', 'qwerty123', 'qwerty12',
  'abc12345', 'abcd1234', 'admin123', 'admin1234', 'admin@123', 'welcome1', 'welcome123', 'welcome@1', 'letmein1',
  'iloveyou1', 'moderator1', 'moderator123', 'libot123', 'libot2026', 'libot@123', 'bulacan123', 'bulacan2026',
  'bulacan@123',
]);

/** The first problem with a username, or ''. */
export function usernameProblem(username) {
  if (username.length < 3 || username.length > 30) return 'Use 3 to 30 characters.';
  if (!/^[a-z0-9._-]+$/.test(username)) return 'Use only lowercase letters, numbers, dots, dashes or underscores, with no spaces.';
  if (!/^[a-z]/.test(username)) return 'Start with a letter.';
  if (/[._-]$/.test(username) || /[._-]{2}/.test(username)) return 'End with a letter or number, and don’t put two of . _ - together.';
  if (RESERVED_USERNAMES.has(username)) return `“${username}” is kept for the system. Choose another.`;
  return '';
}

/** Each rule a new password has to meet, for the live checklist. */
export function passwordChecks(password, username = '') {
  const p = password || '';
  return [
    { key: 'length',  label: `${PASSWORD_MIN} or more characters`, ok: p.length >= PASSWORD_MIN && p.length <= PASSWORD_MAX },
    { key: 'letter',  label: 'A letter',                           ok: /\p{L}/u.test(p) },
    { key: 'number',  label: 'A number',                           ok: /\d/.test(p) },
    { key: 'special', label: 'A special character (like ! # @ -)', ok: /[^\p{L}\p{N}\s]/u.test(p) },
    { key: 'user',    label: 'Not your username',                  ok: !p || !username || !p.toLowerCase().includes(username.toLowerCase()) },
  ];
}

/** The first problem with a password, or ''. */
export function passwordProblem(password, username = '') {
  const p = password || '';
  if (p.length < PASSWORD_MIN || p.length > PASSWORD_MAX) return `Use ${PASSWORD_MIN} to ${PASSWORD_MAX} characters.`;
  if (p !== p.trim()) return 'Remove the spaces at the start or end.';
  if (!/\p{L}/u.test(p) || !/\d/.test(p) || !/[^\p{L}\p{N}\s]/u.test(p)) {
    return 'Use at least one letter, one number and one special character (like ! # @ -).';
  }
  if (username && p.toLowerCase().includes(username.toLowerCase())) return 'Don’t put the username in the password.';
  if (COMMON_PASSWORDS.has(p.toLowerCase())) return 'This password is too easy to guess. Choose another.';
  return '';
}
