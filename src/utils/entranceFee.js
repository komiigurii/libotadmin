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

const FREE = /^(free|libre|walang bayad|no fee|none|0|₱\s*0|php\s*0)(\b|$)/i;

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

/** What's wrong with it, or ''. */
export function entranceFeeProblem(kind, amount) {
  if (!kind) return 'Choose whether the entrance is free or paid.';
  if (kind === 'paid') {
    const a = String(amount ?? '').trim();
    if (!a) return 'Enter how much the entrance costs.';
    const n = Number(a.replace(/,/g, ''));
    if (/^[\d,.]+$/.test(a) && !(n > 0)) return 'A paid entrance costs more than ₱0. Choose Free instead.';
  }
  return '';
}
