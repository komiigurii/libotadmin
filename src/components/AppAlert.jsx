import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import { theme as t, radius, shadow, type } from '../theme';
import Icon from './Icon';

/*
 * Themed replacement for the browser's native `alert()` / `confirm()`..
 * Those render as unstyled OS dialogs that clash with the rest of this
 * app's custom dark UI — this component gives every page the same look
 * the mobile app's components/AppAlert.js already uses.
 *
 * Drop-in usage (call from anywhere, no hook needed):
 *   import { notify, confirmAction } from '../components/AppAlert';
 *   notify('Saved.');
 *   notify('Something went wrong.', { tone: 'danger', title: 'Error' });
 *   const ok = await confirmAction('Delete this comment permanently?', { danger: true });
 *   if (!ok) return;
 *
 * <AppAlertProvider> must be mounted once near the root (see App.jsx) —
 * it owns the actual modal UI and registers the module-level handlers
 * these functions call into.
 */

const AlertContext = createContext(null);

let _notifyHandler = null;
let _confirmHandler = null;

export function notify(message, opts = {}) {
  if (_notifyHandler) _notifyHandler(message, opts);
}

// Resolves true if the user confirmed, false if they cancelled/dismissed.
export function confirmAction(message, opts = {}) {
  return new Promise((resolve) => {
    if (_confirmHandler) _confirmHandler(message, opts, resolve);
    else resolve(false);
  });
}

export function useAppAlert() {
  const ctx = useContext(AlertContext);
  if (!ctx) throw new Error('useAppAlert must be used inside <AppAlertProvider>');
  return ctx;
}

const TONE = {
  danger:  { icon: 'alert-triangle', color: t.danger,  bg: t.dangerBg },
  warning: { icon: 'alert-triangle', color: t.warning, bg: t.warningBg },
  success: { icon: 'check',          color: t.success, bg: t.successBg },
  info:    { icon: 'info',           color: t.brand,   bg: t.brandSoft },
};

function AlertModal({ data, onClose }) {
  const isConfirm = data.kind === 'confirm';
  const tone = TONE[data.tone] || (isConfirm && data.danger ? TONE.danger : TONE.info);
  const titleId = useId();
  const messageId = useId();

  // Esc cancels. Enter is left to the button that has focus: a window-level
  // Enter handler used to confirm before the focused button's own click ran,
  // so Tab to Cancel + Enter went ahead with the action. Focus starts on
  // Cancel when the action is destructive, so Enter alone can't delete or ban,
  // and on the action otherwise, so Enter still confirms like confirm() does.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const focusCancel = isConfirm && !!data.danger;

  return (
    <div style={s.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(false); }}>
      <div
        style={s.card}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={data.title ? titleId : undefined}
        aria-describedby={data.message ? messageId : undefined}
      >
        <div style={{ ...s.iconWrap, background: tone.bg, color: tone.color }}>
          {/* `weight` is Phosphor's stroke control — the inline SVG set this
              replaced took a numeric strokeWidth, which no longer applies. */}
          <Icon name={tone.icon} size={22} weight="bold" />
        </div>
        {data.title && <h2 id={titleId} style={s.title}>{data.title}</h2>}
        {data.message && <p id={messageId} style={s.message}>{data.message}</p>}

        <div style={s.actions}>
          {isConfirm && (
            <button
              onClick={() => onClose(false)}
              style={s.btnCancel}
              className="modern-btn"
              autoFocus={focusCancel}
            >
              {data.cancelText || 'Cancel'}
            </button>
          )}
          <button
            onClick={() => onClose(true)}
            style={{ ...s.btnPrimary, ...(isConfirm && data.danger ? s.btnDanger : {}) }}
            className="modern-btn"
            autoFocus={!focusCancel}
          >
            {isConfirm ? (data.confirmText || 'Confirm') : (data.confirmText || 'OK')}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AppAlertProvider({ children }) {
  const [active, setActive] = useState(null); // { kind, message, ...opts }
  const resolverRef = useRef(null);

  const notifyImpl = useCallback((message, opts) => {
    setActive({ kind: 'notify', message, ...opts });
  }, []);

  const confirmImpl = useCallback((message, opts, resolve) => {
    resolverRef.current = resolve;
    setActive({ kind: 'confirm', message, ...opts });
  }, []);

  useEffect(() => {
    _notifyHandler = notifyImpl;
    _confirmHandler = confirmImpl;
    return () => { _notifyHandler = null; _confirmHandler = null; };
  }, [notifyImpl, confirmImpl]);

  const close = useCallback((confirmed) => {
    if (resolverRef.current) {
      resolverRef.current(confirmed);
      resolverRef.current = null;
    }
    setActive(null);
  }, []);

  return (
    <AlertContext.Provider value={{ notify: notifyImpl, confirm: (msg, opts) => new Promise((r) => confirmImpl(msg, opts, r)) }}>
      {children}
      {active && <AlertModal data={active} onClose={close} />}
    </AlertContext.Provider>
  );
}

const s = {
  overlay: {
    position: 'fixed', inset: 0, background: t.overlay,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 2000, padding: 20,
  },
  card: {
    width: '100%', maxWidth: 380, background: t.cardBg, border: `1px solid ${t.border}`,
    borderRadius: radius.xl, boxShadow: shadow.lg, padding: '28px 26px 22px',
    textAlign: 'center',
  },
  iconWrap: {
    width: 46, height: 46, borderRadius: '50%', display: 'flex', alignItems: 'center',
    justifyContent: 'center', margin: '0 auto 14px', fontSize: 20, fontWeight: 700,
  },
  title:   { ...type.dialogTitle, color: t.textPrimary, margin: '0 0 8px' },
  message: { fontSize: 14, color: t.textSecondary, lineHeight: 1.5, margin: 0, whiteSpace: 'pre-wrap' },

  actions: { display: 'flex', gap: 10, marginTop: 22 },
  btnCancel:  { flex: 1, padding: '10px 16px', borderRadius: radius.md, border: `1px solid ${t.border}`, background: 'transparent', color: t.textSecondary, fontWeight: 600, fontSize: 13.5, cursor: 'pointer' },
  btnPrimary: { flex: 1, padding: '10px 16px', borderRadius: radius.md, border: 'none', background: t.accent, color: t.onAccent, fontWeight: 700, fontSize: 13.5, cursor: 'pointer' },
  // Spread over btnPrimary, so it has to re-set `color` too — the dark
  // `onAccent` text that reads on yellow is unreadable on red.
  btnDanger:  { background: t.danger, color: t.onDanger },
};
