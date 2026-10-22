import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { superadminAPI, authAPI } from '../api/api';
import { getToken, clearSession } from '../auth/session';
import { theme as t, radius, fonts, type, shadow } from '../theme';
import Icon from '../components/Icon';
import logo from '../assets/logo.png';

/*
 * Superadmin — system maintenance screen.
 *
 * Deliberately outside the shared Navbar/shell: the superadmin is a system
 * operator, not a content manager. The screen has its own minimal chrome —
 * just the wordmark and a sign-out link in the header — so it reads as a
 * separate control surface, not a page bolted onto the admin panel.
 *
 * Controls:
 *   Maintenance mode   — locks out ALL admin + moderator sign-ins. A banner
 *                        on the login page explains why (set via message).
 *   Disable admins     — locks out admins only (moderators keep working).
 *   Disable moderators — locks out moderators only (admins keep working).
 *   Maintenance message — the text shown to locked-out users.
 *
 * The backend routes these call are listed in api.js → superadminAPI. They
 * don't exist yet; this screen degrades gracefully (shows an offline notice)
 * until they're wired up.
 */

/* ── Palette ─────────────────────────────────────────────────────────────
   The superadmin surface uses the same CSS variables as the rest of the panel
   but leans into the warning/danger register — amber and red — to signal that
   these controls have real consequences. No teal accents here. */

const SIGN_OUT_CONFIRM = 'Sign out of the system console?';

export default function SuperAdmin() {
  const navigate = useNavigate();

  // null = loading, object = loaded, 'error' = couldn't reach backend
  const [status, setStatus]           = useState(null);
  const [statusError, setStatusError] = useState(false);
  // Which action is in-flight so we can show per-button loading state
  const [busy, setBusy]               = useState('');
  // Inline feedback banners (success or error) per control
  const [feedback, setFeedback]       = useState({});
  // Message editing state
  const [msgDraft, setMsgDraft]       = useState('');
  const [msgEditing, setMsgEditing]   = useState(false);

  /* Fetch current system status on mount. */
  const loadStatus = useCallback(async () => {
    try {
      const data = await superadminAPI.getStatus();
      setStatus(data);
      setMsgDraft(data.maintenanceMessage || '');
      setStatusError(false);
    } catch {
      setStatusError(true);
    }
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  /* Flash a feedback message under a control, then clear it after 4 s. */
  const flash = (key, kind, text) => {
    setFeedback((f) => ({ ...f, [key]: { kind, text } }));
    setTimeout(() => setFeedback((f) => { const n = { ...f }; delete n[key]; return n; }), 4000);
  };

  /* Generic action runner — sets busy, calls fn, reloads status, flashes. */
  const run = async (key, fn, successMsg) => {
    if (busy) return;
    setBusy(key);
    try {
      await fn();
      await loadStatus();
      flash(key, 'success', successMsg);
    } catch (err) {
      const msg = err?.response?.data?.message || "Couldn't reach the server. Try again.";
      flash(key, 'error', msg);
    } finally {
      setBusy('');
    }
  };

  const handleSignOut = async () => {
    if (!window.confirm(SIGN_OUT_CONFIRM)) return;
    const token = getToken();
    try { await authAPI.logout(token); } catch { /* best-effort */ }
    clearSession();
    navigate('/login', { replace: true });
  };

  /* Maintenance message save */
  const saveMessage = async () => {
    await run('msg', () => superadminAPI.setMaintenanceMessage(msgDraft), 'Message updated.');
    setMsgEditing(false);
  };

  const maintenanceOn   = status?.maintenanceMode === true;
  const adminsDisabled  = status?.disabledRoles?.includes('admin');
  const modsDisabled    = status?.disabledRoles?.includes('moderator');

  return (
    <div style={s.shell}>
      {/* ── Header ─────────────────────────────────────────── */}
      <header style={s.header}>
        <div style={s.headerBrand}>
          <img src={logo} alt="" style={s.headerLogo} />
          <div>
            <div style={s.headerWordmark}>Libot Bulacan</div>
            <div style={s.headerSub}>System Console</div>
          </div>
        </div>
        <button style={s.signOutBtn} onClick={handleSignOut}>
          <Icon name="log-out" size={15} />
          Sign out
        </button>
      </header>

      {/* ── Main ───────────────────────────────────────────── */}
      <main style={s.main}>
        <div style={s.page}>

          <div style={s.titleRow}>
            <h1 style={s.title}>System maintenance</h1>
            <button style={s.refreshBtn} onClick={loadStatus} title="Refresh status" aria-label="Refresh system status">
              <Icon name="refresh-cw" size={15} />
            </button>
          </div>
          <p style={s.lead}>
            These controls affect all users of the Libot Bulacan admin panel.
            Changes take effect immediately.
          </p>

          {/* ── Status error ──────────────────────────────── */}
          {statusError && (
            <div style={{ ...s.banner, ...s.bannerWarn }}>
              <Icon name="wifi-off" size={15} />
              <span>
                Couldn't load system status — the backend may be offline or the
                superadmin routes haven't been deployed yet.
                <button style={s.retryLink} onClick={loadStatus}>Try again</button>
              </span>
            </div>
          )}

          {/* ── Live status pill row ──────────────────────── */}
          {status && (
            <div style={s.statusRow}>
              <StatusPill
                label="System"
                on={!maintenanceOn}
                onLabel="Online"
                offLabel="Maintenance"
              />
              <StatusPill
                label="Admins"
                on={!adminsDisabled && !maintenanceOn}
                onLabel="Active"
                offLabel="Locked out"
              />
              <StatusPill
                label="Moderators"
                on={!modsDisabled && !maintenanceOn}
                onLabel="Active"
                offLabel="Locked out"
              />
            </div>
          )}

          {/* ── Controls ──────────────────────────────────── */}
          <div style={s.grid}>

            {/* Maintenance mode */}
            <ControlCard
              icon="alert-triangle"
              iconColor={t.warning}
              title="Maintenance mode"
              description={
                maintenanceOn
                  ? 'All admin and moderator sign-ins are blocked. Disable maintenance when work is complete.'
                  : 'Locks out all admins and moderators immediately. Use during database migrations or deployments.'
              }
              active={maintenanceOn}
              activeLabel="Maintenance is on"
              inactiveLabel="System is live"
              actionLabel={maintenanceOn ? 'Disable maintenance' : 'Enable maintenance'}
              actionVariant={maintenanceOn ? 'safe' : 'danger'}
              busy={busy === 'maintenance'}
              feedback={feedback['maintenance']}
              onAction={() =>
                run(
                  'maintenance',
                  maintenanceOn ? superadminAPI.disableMaintenance : superadminAPI.enableMaintenance,
                  maintenanceOn ? 'Maintenance mode disabled. Panel is live.' : 'Maintenance mode enabled.',
                )
              }
            />

            {/* Disable admins */}
            <ControlCard
              icon="shield-off"
              iconColor={t.danger}
              title="Admin access"
              description={
                adminsDisabled
                  ? 'Admins are locked out. Moderators can still sign in and work normally.'
                  : 'Disable to block all admin sign-ins while keeping moderators active.'
              }
              active={!adminsDisabled}
              activeLabel="Admins can sign in"
              inactiveLabel="Admins locked out"
              actionLabel={adminsDisabled ? 'Re-enable admins' : 'Disable admins'}
              actionVariant={adminsDisabled ? 'safe' : 'warn'}
              busy={busy === 'admins'}
              feedback={feedback['admins']}
              disabled={maintenanceOn}
              disabledReason="Maintenance mode already blocks all roles."
              onAction={() =>
                run(
                  'admins',
                  adminsDisabled
                    ? () => superadminAPI.enableRole('admin')
                    : () => superadminAPI.disableRole('admin'),
                  adminsDisabled ? 'Admin access restored.' : 'Admin access disabled.',
                )
              }
            />

            {/* Disable moderators */}
            <ControlCard
              icon="user-x"
              iconColor={t.danger}
              title="Moderator access"
              description={
                modsDisabled
                  ? 'Moderators are locked out. Admins can still sign in and work normally.'
                  : 'Disable to block all moderator sign-ins while keeping admins active.'
              }
              active={!modsDisabled}
              activeLabel="Moderators can sign in"
              inactiveLabel="Moderators locked out"
              actionLabel={modsDisabled ? 'Re-enable moderators' : 'Disable moderators'}
              actionVariant={modsDisabled ? 'safe' : 'warn'}
              busy={busy === 'moderators'}
              feedback={feedback['moderators']}
              disabled={maintenanceOn}
              disabledReason="Maintenance mode already blocks all roles."
              onAction={() =>
                run(
                  'moderators',
                  modsDisabled
                    ? () => superadminAPI.enableRole('moderator')
                    : () => superadminAPI.disableRole('moderator'),
                  modsDisabled ? 'Moderator access restored.' : 'Moderator access disabled.',
                )
              }
            />

            {/* Maintenance message */}
            <div style={{ ...s.card, gridColumn: '1 / -1' }}>
              <div style={s.cardHeader}>
                <span style={{ ...s.cardIcon, color: t.info }}>
                  <Icon name="message-square" size={18} />
                </span>
                <div>
                  <div style={s.cardTitle}>Maintenance message</div>
                  <p style={s.cardDesc}>
                    Shown to admins and moderators on the sign-in page when they're
                    locked out. Leave empty to show the default "unavailable" text.
                  </p>
                </div>
              </div>

              <div style={s.msgArea}>
                {msgEditing ? (
                  <>
                    <textarea
                      value={msgDraft}
                      onChange={(e) => setMsgDraft(e.target.value)}
                      placeholder="e.g. The panel is down for a scheduled database upgrade. Back online by 3 PM."
                      rows={3}
                      style={s.textarea}
                      aria-label="Maintenance message"
                    />
                    <div style={s.msgActions}>
                      <ActionButton
                        label={busy === 'msg' ? 'Saving…' : 'Save message'}
                        variant="safe"
                        busy={busy === 'msg'}
                        onClick={saveMessage}
                      />
                      <button
                        style={s.cancelBtn}
                        onClick={() => { setMsgEditing(false); setMsgDraft(status?.maintenanceMessage || ''); }}
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <div style={s.msgPreview}>
                    <p style={s.msgText}>
                      {status?.maintenanceMessage || <em style={{ color: t.textMuted }}>No message set — default text will show.</em>}
                    </p>
                    <button style={s.editBtn} onClick={() => setMsgEditing(true)}>
                      <Icon name="edit-2" size={13} /> Edit
                    </button>
                  </div>
                )}
                {feedback['msg'] && <Feedback {...feedback['msg']} />}
              </div>
            </div>

          </div>

          {/* ── Footer note ───────────────────────────────── */}
          <p style={s.footNote}>
            Session changes (disabled roles, maintenance mode) are enforced by the
            server. Existing sessions for affected roles will be rejected at their
            next request.
          </p>

        </div>
      </main>
    </div>
  );
}

/* ── Sub-components ──────────────────────────────────────────────────────── */

function StatusPill({ label, on, onLabel, offLabel }) {
  return (
    <div style={s.pill}>
      <span style={{ ...s.pillDot, background: on ? t.success : t.danger }} />
      <span style={s.pillLabel}>{label}</span>
      <span style={{ ...s.pillValue, color: on ? t.success : t.danger }}>
        {on ? onLabel : offLabel}
      </span>
    </div>
  );
}

function ControlCard({
  icon, iconColor, title, description,
  active, activeLabel, inactiveLabel,
  actionLabel, actionVariant,
  busy, feedback, disabled, disabledReason,
  onAction,
}) {
  return (
    <div style={{ ...s.card, opacity: disabled ? 0.6 : 1 }}>
      <div style={s.cardHeader}>
        <span style={{ ...s.cardIcon, color: iconColor }}>
          <Icon name={icon} size={18} />
        </span>
        <div style={{ flex: 1 }}>
          <div style={s.cardTitle}>{title}</div>
          <p style={s.cardDesc}>{description}</p>
        </div>
        <div style={{ ...s.stateBadge, ...(active ? s.stateBadgeOn : s.stateBadgeOff) }}>
          {active ? activeLabel : inactiveLabel}
        </div>
      </div>
      {disabled && disabledReason && (
        <p style={s.disabledNote}>{disabledReason}</p>
      )}
      {!disabled && (
        <ActionButton
          label={busy ? 'Working…' : actionLabel}
          variant={actionVariant}
          busy={busy}
          onClick={onAction}
        />
      )}
      {feedback && <Feedback {...feedback} />}
    </div>
  );
}

const VARIANT = {
  danger: { background: t.dangerBg, color: t.danger, border: t.dangerBorder },
  warn:   { background: t.warningBg, color: t.warning, border: 'transparent' },
  safe:   { background: t.successBg, color: t.success, border: 'transparent' },
};

function ActionButton({ label, variant, busy, onClick }) {
  const v = VARIANT[variant] || VARIANT.safe;
  return (
    <button
      style={{ ...s.actionBtn, background: v.background, color: v.color, borderColor: v.border }}
      onClick={onClick}
      disabled={busy}
    >
      {label}
    </button>
  );
}

function Feedback({ kind, text }) {
  return (
    <div style={{ ...s.feedbackBanner, ...(kind === 'error' ? s.feedbackError : s.feedbackSuccess) }}>
      <Icon name={kind === 'error' ? 'alert-circle' : 'check-circle'} size={13} />
      {text}
    </div>
  );
}

/* ── Styles ──────────────────────────────────────────────────────────────── */
const s = {
  shell: {
    minHeight: '100vh',
    background: t.bg,
    display: 'flex', flexDirection: 'column',
  },

  // Header
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0 32px', height: 64, flexShrink: 0,
    background: t.brandSolid,
    boxShadow: '0 1px 0 rgba(0,0,0,0.12)',
  },
  headerBrand: { display: 'flex', alignItems: 'center', gap: 12 },
  headerLogo: { width: 34, height: 34, borderRadius: 10, objectFit: 'contain' },
  headerWordmark: {
    fontFamily: fonts.display, fontWeight: 700, fontSize: 15,
    letterSpacing: '0.12em', textTransform: 'uppercase',
    color: t.onBrandSolid, lineHeight: 1.2,
  },
  headerSub: {
    fontSize: 10.5, fontWeight: 700, letterSpacing: '0.18em',
    textTransform: 'uppercase', color: t.onBrandSolidMuted, marginTop: 2,
  },
  signOutBtn: {
    display: 'flex', alignItems: 'center', gap: 7,
    background: 'rgba(0,0,0,0.15)', border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: radius.md, color: t.onBrandSolid,
    fontSize: 13, fontWeight: 600, padding: '7px 14px', cursor: 'pointer',
  },

  // Layout
  main:   { flex: 1, overflowY: 'auto', padding: '40px 24px 80px' },
  page:   { maxWidth: 860, margin: '0 auto' },

  titleRow: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 },
  title:    { ...type.pageTitle, fontSize: 28, color: t.textPrimary, margin: 0 },
  refreshBtn: {
    background: 'none', border: 'none', color: t.textMuted,
    cursor: 'pointer', padding: 6, borderRadius: radius.sm,
    display: 'flex', alignItems: 'center',
  },
  lead: { ...type.body, color: t.textSecondary, marginTop: 0, marginBottom: 28, maxWidth: 540 },

  // Status pills
  statusRow: {
    display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 28,
  },
  pill: {
    display: 'flex', alignItems: 'center', gap: 8,
    background: t.cardBg, border: `1px solid ${t.border}`,
    borderRadius: radius.pill, padding: '7px 14px',
  },
  pillDot:   { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  pillLabel: { fontSize: 12, fontWeight: 700, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' },
  pillValue: { fontSize: 13, fontWeight: 600 },

  // Banners
  banner: {
    display: 'flex', alignItems: 'flex-start', gap: 10,
    borderRadius: radius.md, padding: '12px 16px',
    fontSize: 13.5, lineHeight: 1.5, marginBottom: 24,
    borderWidth: 1, borderStyle: 'solid',
  },
  bannerWarn: { background: t.warningBg, color: t.warning, borderColor: 'transparent' },

  retryLink: {
    background: 'none', border: 'none', color: 'inherit',
    textDecoration: 'underline', cursor: 'pointer',
    fontSize: 'inherit', fontWeight: 600, marginLeft: 6, padding: 0,
  },

  // Control grid
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
    gap: 16,
    marginBottom: 32,
  },

  // Cards
  card: {
    background: t.cardBg, border: `1px solid ${t.border}`,
    borderRadius: radius.lg, padding: 24,
    boxShadow: shadow.sm,
    display: 'flex', flexDirection: 'column', gap: 16,
  },
  cardHeader: { display: 'flex', alignItems: 'flex-start', gap: 14 },
  cardIcon: {
    width: 36, height: 36, borderRadius: radius.md,
    background: t.bg, display: 'grid', placeItems: 'center',
    flexShrink: 0, marginTop: 1,
  },
  cardTitle: { ...type.cardTitle, color: t.textPrimary, marginBottom: 4 },
  cardDesc:  { ...type.body, fontSize: 13, color: t.textSecondary, margin: 0, maxWidth: 360 },

  stateBadge: {
    flexShrink: 0, fontSize: 11.5, fontWeight: 700,
    padding: '3px 10px', borderRadius: radius.pill,
    whiteSpace: 'nowrap',
  },
  stateBadgeOn:  { background: t.successBg, color: t.success },
  stateBadgeOff: { background: t.dangerBg,  color: t.danger  },

  disabledNote: { fontSize: 12.5, color: t.textMuted, margin: 0, fontStyle: 'italic' },

  actionBtn: {
    alignSelf: 'flex-start',
    padding: '9px 18px', borderRadius: radius.md,
    fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
    borderWidth: 1, borderStyle: 'solid',
    transition: 'opacity 0.15s',
  },

  feedbackBanner: {
    display: 'flex', alignItems: 'center', gap: 7,
    fontSize: 13, fontWeight: 500, padding: '8px 12px',
    borderRadius: radius.sm,
  },
  feedbackSuccess: { background: t.successBg, color: t.success },
  feedbackError:   { background: t.dangerBg,  color: t.danger  },

  // Message card
  msgArea: { display: 'flex', flexDirection: 'column', gap: 12 },
  msgPreview: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    gap: 12, background: t.bg, borderRadius: radius.md,
    padding: '12px 16px', border: `1px solid ${t.border}`,
  },
  msgText:  { ...type.body, color: t.textPrimary, margin: 0, flex: 1 },
  editBtn: {
    display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
    background: 'none', border: `1px solid ${t.border}`,
    borderRadius: radius.sm, color: t.textMuted,
    fontSize: 12, fontWeight: 600, padding: '5px 10px', cursor: 'pointer',
  },
  textarea: {
    width: '100%', boxSizing: 'border-box',
    padding: '12px 14px', borderRadius: radius.md,
    border: `1px solid ${t.border}`, background: t.bg,
    color: t.textPrimary, fontFamily: fonts.sans, fontSize: 14,
    lineHeight: 1.5, resize: 'vertical', outline: 'none',
  },
  msgActions: { display: 'flex', alignItems: 'center', gap: 10 },
  cancelBtn: {
    background: 'none', border: 'none', color: t.textMuted,
    fontSize: 13.5, fontWeight: 600, cursor: 'pointer', padding: '9px 4px',
  },

  footNote: {
    fontSize: 12.5, color: t.textMuted, lineHeight: 1.6,
    maxWidth: 540, margin: '4px 0 0',
  },
};