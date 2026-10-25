import { useEffect, useId, useState } from 'react';
import { theme as t, radius, shadow, type, fonts } from '../theme';
import Icon from './Icon';
import { Button } from './Layout';
import { confirmAction } from './AppAlert';
import { fmtDateTime } from '../utils/format';
import './CredentialSlip.css';

/*
 * The credential slip (mock defense 2026-10-21): how a new admin or moderator
 * account, or a reset one, reaches its holder. Staff accounts have no email,
 * so the server makes a temporary password and hands it back ONCE; this shows
 * it with the username and where to sign in, to copy or print and give to the
 * person (in person, or through the LGU's own channel). At their first sign-in
 * they must choose their own password, and the temporary one stops working
 * after 72 hours. Closing asks first: it can't be shown again.
 *
 * A forgotten password's slip is also emailed to the address the person
 * confirmed with a code (2026-10-23); `email` says where, and whether it went.
 *
 * Props: { kind: 'new' | 'reset', account: { username, role, municipality },
 *          tempPassword, expiresAt, onClose, email?: { to, sent } }
 */

// "Tq7#mR2v!Kp9" → "Tq7# mR2v !Kp9": easier to read off paper. Copy and print
// keep it without the spaces.
const grouped = (pw) => pw.replace(/(.{4})(?=.)/g, '$1 ');

const roleName = (role) => (role === 'admin' ? 'admin' : role === 'superadmin' ? 'super admin' : 'moderator');

export default function CredentialSlip({ kind = 'new', account, tempPassword, expiresAt, onClose, email = null }) {
  const titleId = useId();
  const [copied, setCopied] = useState(false);
  const panelUrl = `${window.location.origin}/login`;
  const who = `${account.municipality ? `${account.municipality} ` : ''}${roleName(account.role)}`;
  const until = expiresAt ? fmtDateTime(expiresAt) : '';

  const text = [
    'LibotBulacan Console',
    `Sign in at: ${panelUrl}`,
    `Username: ${account.username}`,
    `Temporary password: ${tempPassword}`,
    until ? `Works until: ${until}` : null,
    'At your first sign-in you will choose your own password.',
  ].filter(Boolean).join('\n');

  const close = async () => {
    const ok = await confirmAction(
      'The temporary password can’t be shown again. If it’s lost, they use Forgot password on the sign-in page to get a new slip.',
      { title: 'Close the slip?', confirmText: 'Close', cancelText: 'Keep it open', tone: 'warning' },
    );
    if (ok) onClose();
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  // Esc is "Done", which asks first.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div style={s.overlay}>
      <div className="credential-slip" style={s.slip} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div style={s.head}>
          <Icon name="key" size={18} color={t.brand} />
          <h2 id={titleId} style={s.title}>
            {kind === 'reset' ? `New temporary password for ${account.username}` : `New ${who} account`}
          </h2>
        </div>
        {email?.sent ? (
          <p className="slip-no-print" style={{ ...s.lead, ...s.sent }} role="status">
            <Icon name="check" size={14} color={t.success} /> <span>Emailed to <strong>{email.to}</strong>. It’s shown here only once.</span>
          </p>
        ) : email ? (
          <p className="slip-no-print" style={{ ...s.lead, ...s.unsent }} role="alert">
            <Icon name="alert-triangle" size={14} color={t.danger} />
            <span>Couldn’t email it to <strong>{email.to}</strong>. Copy it and send it yourself, or give it in person. It’s shown only once.</span>
          </p>
        ) : (
          <p className="slip-no-print" style={s.lead}>
            Give this to the {roleName(account.role)} in person or through your office’s own channel. It’s shown only once.
          </p>
        )}

        <dl style={s.rows}>
          <div style={s.row}><dt style={s.dt}>Sign in at</dt><dd style={s.dd}>{panelUrl}</dd></div>
          <div style={s.row}><dt style={s.dt}>Username</dt><dd style={{ ...s.dd, ...s.mono }}>{account.username}</dd></div>
          {account.municipality && (
            <div style={s.row}><dt style={s.dt}>Municipality</dt><dd style={s.dd}>{account.municipality}</dd></div>
          )}
        </dl>

        <div style={s.pwBox}>
          <div style={s.pwLabel}>Temporary password</div>
          <div style={s.pw} aria-label={`Temporary password: ${tempPassword.split('').join(' ')}`}>{grouped(tempPassword)}</div>
        </div>

        <p style={s.note}>
          {until && <>Works until <strong>{until}</strong>. </>}
          At the first sign-in they choose their own password; this one then stops working.
        </p>

        <div className="slip-no-print" style={s.actions}>
          <Button icon={copied ? 'check' : 'copy'} onClick={copy}>{copied ? 'Copied' : 'Copy'}</Button>
          <Button icon="printer" onClick={() => window.print()}>Print</Button>
          <Button variant="primary" onClick={close} style={{ marginLeft: 'auto' }}>Done</Button>
        </div>
      </div>
    </div>
  );
}

const s = {
  // Under the alert layer (2000), so "Close the slip?" opens on top of it.
  overlay: {
    position: 'fixed', inset: 0, background: t.overlay, zIndex: 1900,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
  },
  // A slip of paper: a dashed edge like something to cut out and hand over.
  slip: {
    width: '100%', maxWidth: 440, background: t.cardBg, borderRadius: radius.lg,
    border: `1.5px dashed ${t.border}`, boxShadow: shadow.lg, padding: '22px 24px 20px',
    boxSizing: 'border-box',
  },
  head:  { display: 'flex', alignItems: 'center', gap: 10 },
  title: { ...type.dialogTitle, color: t.textPrimary, margin: 0, fontSize: 19 },
  lead:  { fontSize: 13, color: t.textSecondary, lineHeight: 1.5, margin: '8px 0 0' },
  sent:   { display: 'flex', gap: 6, alignItems: 'baseline', overflowWrap: 'anywhere' },
  unsent: { display: 'flex', gap: 6, alignItems: 'baseline', overflowWrap: 'anywhere', color: t.danger },
  rows:  { margin: '16px 0 0', display: 'grid', gap: 8 },
  row:   { display: 'grid', gridTemplateColumns: '108px 1fr', gap: 10, alignItems: 'baseline' },
  dt:    { ...type.label, color: t.textMuted },
  dd:    { margin: 0, fontSize: 14, color: t.textPrimary, overflowWrap: 'anywhere' },
  mono:  { fontFamily: fonts.mono, fontWeight: 600 },
  pwBox: {
    marginTop: 16, padding: '14px 16px', borderRadius: radius.md,
    background: t.accentBg, border: `1px solid ${t.border}`,
  },
  pwLabel: { ...type.label, color: t.textSecondary },
  pw: {
    marginTop: 6, fontFamily: fonts.mono, fontSize: 26, fontWeight: 700, letterSpacing: '0.08em',
    color: t.textPrimary, whiteSpace: 'nowrap', overflowX: 'auto',
  },
  note:    { fontSize: 12.5, color: t.textSecondary, lineHeight: 1.5, margin: '12px 0 0' },
  actions: { display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap' },
};
