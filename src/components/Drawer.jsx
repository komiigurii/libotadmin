import { useEffect, useId, useRef } from 'react';
import { theme as t, shadow, type } from '../theme';
import Icon from './Icon';

/*
 * A panel that slides over the right side of the page: one account's history,
 * one traveler's overview. Esc or the backdrop closes it; focus moves in when
 * it opens and back to what opened it when it closes. footer: a bar pinned
 * under the scrolling body (a traveler's Warn / Suspend / Ban).
 */
export default function Drawer({ title, subtitle, onClose, children, footer, width = 460 }) {
  const titleId = useId();
  const closeRef = useRef(null);

  useEffect(() => {
    const opener = document.activeElement;
    closeRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
      if (opener && typeof opener.focus === 'function') opener.focus();
    };
  }, [onClose]);

  return (
    <div style={s.backdrop} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside style={{ ...s.panel, width: `min(${width}px, 100vw)` }} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header style={s.head}>
          <div style={{ minWidth: 0 }}>
            <h2 id={titleId} style={s.title}>{title}</h2>
            {subtitle && <p style={s.sub}>{subtitle}</p>}
          </div>
          <button ref={closeRef} type="button" onClick={onClose} style={s.close} aria-label="Close">
            <Icon name="x" size={16} color={t.textPrimary} />
          </button>
        </header>
        <div style={s.body}>{children}</div>
        {footer && <footer style={s.foot}>{footer}</footer>}
      </aside>
    </div>
  );
}

const s = {
  backdrop: { position: 'fixed', inset: 0, background: t.overlay, zIndex: 1500, display: 'flex', justifyContent: 'flex-end' },
  panel: {
    height: '100dvh', background: t.cardBg, borderLeft: `1px solid ${t.border}`, boxShadow: shadow.lg,
    display: 'flex', flexDirection: 'column', boxSizing: 'border-box',
  },
  head: {
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
    padding: '20px 22px 14px', borderBottom: `1px solid ${t.divider}`,
  },
  title: { ...type.dialogTitle, color: t.textPrimary, margin: 0, overflowWrap: 'anywhere' },
  sub:   { fontSize: 13, color: t.textSecondary, margin: '4px 0 0' },
  close: {
    display: 'grid', placeItems: 'center', width: 34, height: 34, borderRadius: 10, flexShrink: 0,
    border: 'none', background: t.cardBgHover, cursor: 'pointer',
  },
  body: { flex: 1, overflowY: 'auto', padding: '16px 22px 24px' },
  foot: { flexShrink: 0, padding: '14px 22px 18px', borderTop: `1px solid ${t.divider}`, background: t.cardBg },
};
