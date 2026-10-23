import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import Icon from './Icon';
import logo from '../assets/logo.png';
import { useThemePref } from '../theme';
import { useHeartbeat } from '../auth/heartbeat';
import { clearSession, getToken } from '../auth/session';
import { accountsAPI, authAPI } from '../api/api';
import { confirmAction } from './AppAlert';
import { Button } from './Layout';
import { fmtDay, timeAgo } from '../utils/format';
import '../superadmin.css';

/*
 * The super admin's console frame (2026-10-23, from the user's reference: a
 * dark rail and top bar around full-width pages). The admin and moderator
 * consoles keep components/Navbar.jsx.
 *
 *   rail      the brand, Jump to page (Ctrl K), the links in groups, and the
 *             account at the foot (View profile, Change password, Sign out).
 *             Folds to icons from the top bar's button (remembered), always on
 *             a tablet, and becomes a drawer on a phone.
 *   top bar   the fold button, the system's state, the bell and the theme.
 *
 * While mounted it marks <html data-console="superadmin">, which is what
 * switches on superadmin.css: the ink shell, the page bands, the series
 * hues. public/theme-init.js sets the same mark before first paint.
 */

const NAV = [
  { group: 'Overview', items: [
    { label: 'Dashboard', path: '/dashboard', icon: 'grid', hint: 'The system’s state, waiting work and how the app is used', keys: 'home overview usage charts health' },
  ] },
  { group: 'System', items: [
    { label: 'System', path: '/system', icon: 'tool', hint: 'Maintenance, who can sign in, update notices, tools', keys: 'maintenance pause restrict notice update cache health unlock locked log' },
    { label: 'Tickets', path: '/tickets', icon: 'flag', badge: 'tickets', hint: 'Problems and password requests from staff', keys: 'report problem password forgot slip' },
  ] },
  { group: 'Accounts', items: [
    { label: 'Accounts', path: '/accounts', icon: 'shield', hint: 'Admins, moderators and travelers', keys: 'staff admin moderator traveler user reset deactivate slip move town' },
    { label: 'Activity Log', path: '/activity', icon: 'history', hint: 'Who did what in the console', keys: 'audit log sign-in login history' },
  ] },
  { group: 'Inbox', items: [
    { label: 'Notifications', path: '/notifications', icon: 'bell', badge: 'unread', hint: 'Your bell', keys: 'bell inbox unread' },
  ] },
];
const EXTRA = [
  { label: 'Change password', path: '/change-password', icon: 'key', hint: 'Your own password', keys: 'password security' },
];

const isHere = (path, current) => current === path || current.startsWith(`${path}/`);
const RAIL_KEY = 'libot_admin_rail';
const readRail = () => { try { return localStorage.getItem(RAIL_KEY) === 'collapsed' ? 'collapsed' : 'open'; } catch { return 'open'; } };

// Closes a popover on Esc or a click outside it.
function useDismiss(open, close, ref) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) close(); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('mousedown', onDown); };
  }, [open, close, ref]);
}

export default function SuperShell({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const beat = useHeartbeat();
  const [rail, setRail] = useState(readRail);
  const [drawer, setDrawer] = useState(false);
  const [jumpOpen, setJumpOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  useLayoutEffect(() => {
    document.documentElement.setAttribute('data-console', 'superadmin');
    return () => document.documentElement.removeAttribute('data-console');
  }, []);

  // Ctrl K / ⌘K, anywhere in the console.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setJumpOpen((v) => !v); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Picking a page closes the phone drawer.
  useEffect(() => { setDrawer(false); }, [location.pathname]);
  useEffect(() => {
    if (!drawer) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setDrawer(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawer]);

  const toggleRail = () => {
    const next = rail === 'collapsed' ? 'open' : 'collapsed';
    setRail(next);
    try { localStorage.setItem(RAIL_KEY, next); } catch { /* private mode */ }
  };

  const signOut = async () => {
    const ok = await confirmAction('You will need your username and password to sign back in.', {
      title: 'Sign out of the console?', confirmText: 'Sign out', tone: 'warning',
    });
    if (!ok) return;
    const token = getToken();
    if (token) authAPI.logout(token).catch(() => {});
    clearSession();
    navigate('/login');
  };

  const counts = { unread: beat?.unread || 0, tickets: beat?.openTickets || 0 };
  const all = NAV.flatMap((g) => g.items);
  const current = [...all, ...EXTRA].find((i) => isHere(i.path, location.pathname));
  const username = beat?.username || '';

  return (
    <div className="sa-shell admin-shell" data-rail={rail}>
      <a href="#main" className="skip-link">Skip to content</a>
      {drawer && <div className="sa-backdrop" onClick={() => setDrawer(false)} aria-hidden="true" />}

      <nav id="admin-nav" className={`sa-rail${drawer ? ' open' : ''}`} aria-label="Main">
        <button type="button" className="sa-icon-btn sa-drawer-close" onClick={() => setDrawer(false)} aria-label="Close menu">
          <Icon name="x" size={18} />
        </button>
        <button type="button" className="sa-brand" onClick={() => navigate('/dashboard')} aria-label="Libot Bulacan super admin console, go to the dashboard">
          <img src={logo} alt="" />
          <span className="sa-brand-text sa-hide-collapsed">
            <span className="sa-brand-name">LibotBulacan</span>
            <span className="sa-brand-sub">Super admin console</span>
          </span>
        </button>

        <button type="button" className="sa-jump" onClick={() => setJumpOpen(true)} aria-keyshortcuts="Control+K" title="Jump to page (Ctrl K)">
          <Icon name="search" size={16} />
          <span className="sa-jump-label sa-hide-collapsed">Jump to page</span>
          <kbd className="sa-kbd sa-hide-collapsed">Ctrl K</kbd>
        </button>

        <div className="sa-nav">
          {NAV.map((g) => (
            <div key={g.group} className="sa-group" role="group" aria-labelledby={`sa-g-${g.group}`}>
              <div id={`sa-g-${g.group}`} className="sa-group-label sa-hide-collapsed">{g.group}</div>
              {g.items.map((item) => {
                const here = isHere(item.path, location.pathname);
                const n = item.badge ? counts[item.badge] : 0;
                return (
                  <button
                    key={item.path}
                    type="button"
                    className="sa-link"
                    onClick={() => navigate(item.path)}
                    aria-current={here ? 'page' : undefined}
                    title={rail === 'collapsed' ? item.label : undefined}
                  >
                    <span className="sa-link-icon"><Icon name={item.icon} size={18} weight={here ? 'fill' : 'regular'} /></span>
                    <span className="sa-link-label sa-hide-collapsed">
                      {item.label}
                      {n > 0 && <span className="visually-hidden">, {n} waiting</span>}
                    </span>
                    {n > 0 && <span className="sa-count" aria-hidden="true">{n > 99 ? '99+' : n}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <AccountMenu
          username={username}
          onProfile={() => setProfileOpen(true)}
          onPassword={() => navigate('/change-password')}
          onSignOut={signOut}
        />
      </nav>

      <div className="sa-frame">
        <header className="sa-topbar">
          <button type="button" className="sa-icon-btn sa-menu-btn" onClick={() => setDrawer(true)} aria-label="Open menu" aria-expanded={drawer} aria-controls="admin-nav">
            <Icon name="menu" size={20} />
          </button>
          <button type="button" className="sa-icon-btn sa-rail-toggle" onClick={toggleRail}
            aria-label={rail === 'collapsed' ? 'Show the menu labels' : 'Fold the menu to icons'} aria-pressed={rail === 'collapsed'}>
            <Icon name="sidebar" size={19} />
          </button>
          <div className="sa-topbar-title">{current?.label || 'Super admin console'}</div>
          <div className="sa-topbar-space" />
          <SystemState system={beat?.system} />
          <Link to="/notifications" className="sa-icon-btn boxed" aria-label={counts.unread ? `Notifications, ${counts.unread} unread` : 'Notifications'}>
            <Icon name="bell" size={18} />
            {counts.unread > 0 && <span className="sa-count" aria-hidden="true">{counts.unread > 99 ? '99+' : counts.unread}</span>}
          </Link>
          <ThemeMenu />
        </header>
        {children}
      </div>

      {jumpOpen && <JumpDialog items={[...all, ...EXTRA]} onClose={() => setJumpOpen(false)} onGo={(p) => { setJumpOpen(false); navigate(p); }} />}
      {profileOpen && <ProfileDialog username={username} onClose={() => setProfileOpen(false)} onPassword={() => { setProfileOpen(false); navigate('/change-password'); }} />}
    </div>
  );
}

// Maintenance and paused roles, readable from every page (the heartbeat
// brings them every 45 s).
function SystemState({ system }) {
  if (!system) return null;
  const paused = system.restrictedRoles || [];
  const on = system.maintenance?.on;
  const text = on ? 'Maintenance on'
    : paused.length ? `${paused.map((r) => (r === 'admin' ? 'Admins' : 'Moderators')).join(' and ')} paused`
      : 'System open';
  return (
    <Link to="/system" className={`sa-state${on || paused.length ? ' warn' : ''}`} title="Open the System page">
      <span className="sa-state-dot" aria-hidden="true" />
      <span className="sa-state-text">{text}</span>
      {(on || paused.length > 0) && <span className="visually-hidden">{text}</span>}
    </Link>
  );
}

function ThemeMenu() {
  const [pref, setPref] = useThemePref();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, ref);
  const options = [
    { key: 'light', label: 'Light', icon: 'sun' },
    { key: 'dark', label: 'Dark', icon: 'moon' },
    { key: 'system', label: 'Same as this device', icon: 'monitor' },
  ];
  const now = options.find((o) => o.key === pref) || options[2];
  return (
    <div className="sa-rel" ref={ref}>
      <button type="button" className="sa-icon-btn boxed" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open}
        aria-label={`Theme: ${now.label}`} title="Theme">
        <Icon name={now.icon} size={18} />
      </button>
      {open && (
        <div className="sa-menu" role="menu" aria-label="Theme" style={{ right: 0, top: 46 }}>
          {options.map((o) => (
            <button key={o.key} type="button" role="menuitemradio" aria-checked={pref === o.key} className="sa-menu-item"
              onClick={() => { setPref(o.key); setOpen(false); }}>
              <Icon name={o.icon} size={16} />
              {o.label}
              {pref === o.key && <span className="sa-menu-check"><Icon name="check" size={14} weight="bold" /></span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AccountMenu({ username, onProfile, onPassword, onSignOut }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, ref);
  const pick = (fn) => () => { setOpen(false); fn(); };
  const initial = (username || 'S').charAt(0).toUpperCase();
  return (
    <div className="sa-account" ref={ref}>
      {open && (
        <div className="sa-menu" role="menu" aria-label="Your account" style={{ left: 10, right: 10, bottom: 'calc(100% - 4px)' }}>
          <div className="sa-menu-head">
            <span className="sa-avatar" aria-hidden="true">{initial}</span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontWeight: 700, fontSize: 16 }}>{username || 'Super admin'}</span>
              <span style={{ display: 'block', fontSize: 14, color: 'var(--text-muted)' }}>Super admin · All of Bulacan</span>
            </span>
          </div>
          <button type="button" role="menuitem" className="sa-menu-item" onClick={pick(onProfile)}><Icon name="user" size={16} /> View profile</button>
          <button type="button" role="menuitem" className="sa-menu-item" onClick={pick(onPassword)}><Icon name="key" size={16} /> Change password</button>
          <button type="button" role="menuitem" className="sa-menu-item danger" onClick={pick(onSignOut)}><Icon name="log-out" size={16} /> Sign out</button>
        </div>
      )}
      <button type="button" className="sa-account-btn" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open}
        aria-label={`Your account${username ? `, ${username}` : ''}`}>
        <span className="sa-avatar" aria-hidden="true">{initial}</span>
        <span className="sa-account-text sa-hide-collapsed">
          <span className="sa-account-name">{username || 'Super admin'}</span>
          <span className="sa-account-role">Super admin</span>
        </span>
        <span className="sa-hide-collapsed" style={{ color: 'var(--sa-shell-muted)', display: 'inline-flex' }}><Icon name="chevrons-up-down" size={15} /></span>
      </button>
    </div>
  );
}

// A dialog that keeps focus inside while open and gives it back on close.
function useDialogFocus(onClose) {
  const ref = useRef(null);
  useEffect(() => {
    const opener = document.activeElement;
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (e.key !== 'Tab' || !ref.current) return;
      const els = [...ref.current.querySelectorAll('button, input, a[href], [tabindex]:not([tabindex="-1"])')].filter((el) => !el.disabled);
      if (!els.length) return;
      const first = els[0];
      const last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (opener && typeof opener.focus === 'function') opener.focus();
    };
  }, [onClose]);
  return ref;
}

function JumpDialog({ items, onClose, onGo }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const ref = useDialogFocus(onClose);
  const titleId = useId();
  const listId = useId();
  const shown = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return items;
    return items.filter((i) => {
      const hay = `${i.label} ${i.hint} ${i.keys}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [q, items]);
  const at = Math.min(sel, Math.max(0, shown.length - 1));

  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((at + 1) % Math.max(1, shown.length)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((at - 1 + shown.length) % Math.max(1, shown.length)); }
    else if (e.key === 'Enter' && shown[at]) { e.preventDefault(); onGo(shown[at].path); }
  };

  return (
    <div className="sa-dialog-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sa-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref}>
        <h2 id={titleId} className="visually-hidden">Jump to page</h2>
        <div className="sa-jump-field">
          <Icon name="search" size={18} />
          <input
            autoFocus
            className="sa-jump-input"
            value={q}
            onChange={(e) => { setQ(e.target.value); setSel(0); }}
            onKeyDown={onKey}
            placeholder="Jump to a page: maintenance, tickets, accounts…"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={shown[at] ? `${listId}-${at}` : undefined}
            aria-label="Search pages"
          />
        </div>
        <ul className="sa-jump-list" id={listId} role="listbox" aria-label="Pages">
          {shown.length === 0 && <li style={{ padding: '14px 12px', color: 'var(--text-muted)', fontSize: 16 }}>No page matches “{q.trim()}”.</li>}
          {shown.map((i, n) => (
            <li key={i.path} role="presentation">
              <button
                type="button"
                id={`${listId}-${n}`}
                role="option"
                aria-selected={n === at}
                className="sa-jump-item"
                onMouseEnter={() => setSel(n)}
                onClick={() => onGo(i.path)}
                tabIndex={-1}
              >
                <Icon name={i.icon} size={18} color="var(--brand)" />
                <span style={{ minWidth: 0 }}>
                  {i.label}
                  <small>{i.hint}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="sa-jump-foot" aria-hidden="true">
          <span><kbd>↑</kbd> <kbd>↓</kbd> to choose</span>
          <span><kbd>Enter</kbd> to open</span>
          <span><kbd>Esc</kbd> to close</span>
        </div>
      </div>
    </div>
  );
}

function ProfileDialog({ username, onClose, onPassword }) {
  const ref = useDialogFocus(onClose);
  const titleId = useId();
  const [me, setMe] = useState(undefined);
  useEffect(() => {
    let live = true;
    accountsAPI.getStaff({ role: 'superadmin' })
      .then((d) => { if (live) setMe((d.accounts || []).find((a) => a.username === username) || null); })
      .catch(() => { if (live) setMe(null); });
    return () => { live = false; };
  }, [username]);

  const rows = [
    ['Username', username || '—'],
    ['Role', 'Super admin'],
    ['Looks after', 'All of Bulacan'],
    ['Account made', me ? <span className="sa-mono">{fmtDay(me.createdAt)}</span> : me === undefined ? '…' : '—'],
    ['Last signed in', me?.lastLoginAt ? <span className="sa-mono">{timeAgo(me.lastLoginAt)}</span> : me === undefined ? '…' : '—'],
  ];
  return (
    <div className="sa-dialog-backdrop" style={{ alignItems: 'center', paddingTop: 16 }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sa-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref} style={{ maxWidth: 420 }}>
        <div style={{ background: 'var(--sa-band)', color: 'var(--sa-shell-text)', padding: '22px 22px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <span className="sa-avatar" style={{ width: 54, height: 54, fontSize: 24 }} aria-hidden="true">{(username || 'S').charAt(0).toUpperCase()}</span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h2 id={titleId} style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 26, lineHeight: 1.05, overflowWrap: 'anywhere' }}>{username || 'Super admin'}</h2>
            <p style={{ margin: '4px 0 0', fontSize: 15, color: 'var(--sa-shell-muted)' }}>Your account</p>
          </div>
          <button type="button" className="sa-icon-btn boxed" onClick={onClose} aria-label="Close" autoFocus><Icon name="x" size={16} /></button>
        </div>
        <dl style={{ margin: 0, padding: '8px 22px' }}>
          {rows.map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '9px 0', borderBottom: '1px solid var(--divider)', fontSize: 16 }}>
              <dt style={{ color: 'var(--text-muted)' }}>{k}</dt>
              <dd style={{ margin: 0, fontWeight: 700, color: 'var(--text-primary)', textAlign: 'right' }}>{v}</dd>
            </div>
          ))}
        </dl>
        <p style={{ margin: 0, padding: '4px 22px 0', fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.4 }}>
          Usernames are permanent. Your password is the one thing you change here.
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '14px 22px 18px' }}>
          <Button onClick={onClose}>Close</Button>
          <Button variant="primary" icon="key" onClick={onPassword}>Change password</Button>
        </div>
      </div>
    </div>
  );
}
