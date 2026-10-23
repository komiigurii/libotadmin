/*
 * The entrance fee as two buttons, Free or Paid, plus the amount when it's paid
 * (mock defense 2026-10-21: "sa entrance fee, dapat may two button choices kung
 * free or paid"). It is still saved as the one line the app shows — "Free" or
 * "₱50" — so the app needs no update.
 *
 * Older spots were typed freely ("₱20 adults, ₱10 kids", "Donation"). What
 * can't be read as a plain amount stays as written, in Paid's box, so nothing
 * is lost.
 */

const FREE = /^(free|libre|walang bayad|no fee|no entrance fee|none|0|₱\s*0|php\s*0)(\b|$)/i;

/** "Free" | "₱50" | anything → { kind: 'free' | 'paid' | '', amount } */
export function parseEntranceFee(value) {
  const v = String(value ?? '').trim();
  if (!v) return { kind: '', amount: '' };
  if (FREE.test(v)) return { kind: 'free', amount: '' };
  const plain = v.match(/^(?:₱|php|p)?\s*([\d,]+(?:\.\d{1,2})?)(?:\s*(?:pesos?|php))?$/i);
  if (plain) return { kind: 'paid', amount: plain[1].replace(/,/g, '') };
  return { kind: 'paid', amount: v };
}

/** What gets saved. A bare number gets the peso sign; other text stays. */
export function formatEntranceFee(kind, amount) {
  if (kind === 'free') return 'Free';
  if (kind !== 'paid') return '';
  const a = String(amount ?? '').trim();
  if (!a) return '';
  return /^\d+(\.\d{1,2})?$/.test(a.replace(/,/g, '')) ? `₱${a.replace(/,/g, '')}` : a;
}

/**
 * What can be typed in Paid's box: digits and one decimal point, two places
 * at most. No minus sign, so no negative amount (mock defense notes,
 * 2026-10-23: "tumatanggap ng 0 to negative values").
 */
export function cleanFeeAmount(value) {
  const [whole, ...rest] = String(value ?? '').replace(/[^\d.]/g, '').split('.');
  return rest.length ? `${whole}.${rest.join('').slice(0, 2)}` : whole;
}

/**
 * What's wrong with it, or ''. Paid takes one amount over ₱0. `saved` is the
 * fee the spot already has: an older spot's written-out prices ("₱20 for
 * students…") can stay as they are, but anything typed is a number.
 */
export function entranceFeeProblem(kind, amount, saved = '') {
  if (!kind) return 'Choose whether the entrance is free or paid.';
  if (kind === 'paid') {
    const a = String(amount ?? '').trim();
    if (!a) return 'Enter how much the entrance costs.';
    if (a === String(saved ?? '').trim() && !/^[\d,.\s₱-]+$/.test(a)) return '';
    if (!/^\d+(\.\d{1,2})?$/.test(a.replace(/,/g, ''))) return 'Enter the amount as a number of pesos, like 50.';
    if (!(Number(a.replace(/,/g, '')) > 0)) return 'A paid entrance costs more than ₱0. If there is no fee, choose Free.';
  }
  return '';
}
