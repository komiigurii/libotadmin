import { useCallback, useEffect, useId, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ticketsAPI } from '../api/api';
import {
  Page, PageHeader, Toolbar, SearchInput, FilterTabs, Button, StatusPill, Tag, Loading, EmptyState, ErrorBanner,
  pageStyles as s,
} from '../components/Layout';
import Pagination from '../components/Pagination';
import CredentialSlip from '../components/CredentialSlip';
import { notify, confirmAction } from '../components/AppAlert';
import Icon from '../components/Icon';
import { isSuperAdmin } from '../auth/roles';
import { theme as t, radius } from '../theme';
import { fmtDateTime, timeAgo } from '../utils/format';

/*
 * Tickets (mock defense 2026-10-21: "Report a problem (ticket) for mod and
 * admin").
 *   Admins and moderators: "Report a Problem" — send one, follow its answers.
 *   The super admin: the queue — answer, set the status, and turn a forgotten
 *   password (asked for on the sign-in page) into a new credential slip.
 * Travelers' Report a Problem in the app is different: it is emailed to the
 * developers.
 */

export const CATEGORY = {
  bug:           { label: 'Something isn’t working', icon: 'alert-triangle' },
  spot:          { label: 'Spot details or the map', icon: 'map-pin' },
  account:       { label: 'My account',              icon: 'shield' },
  request:       { label: 'A request or approval',   icon: 'inbox' },
  other:         { label: 'Something else',          icon: 'message-square' },
  passwordReset: { label: 'Forgot password',         icon: 'key' },
};
const SENDER_CATEGORIES = ['bug', 'spot', 'account', 'request', 'other'];

export const TICKET_STATUS = {
  open:       { tone: 'warning', icon: 'clock',        label: 'Open' },
  inProgress: { tone: 'info',    icon: 'tool',         label: 'Being worked on' },
  resolved:   { tone: 'success', icon: 'check-circle', label: 'Resolved' },
};

const errorOf = (err) => err?.response?.data?.message || 'Couldn’t reach the server. Try again.';

export default function Tickets() {
  const navigate = useNavigate();
  const superAdmin = isSuperAdmin();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState(superAdmin ? 'open' : '');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [writing, setWriting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => { setSearch(query.trim()); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const load = useCallback(async () => {
    try {
      setData(await ticketsAPI.list({ page, limit: 20, ...(status ? { status } : {}), ...(search ? { q: search } : {}) }));
      setError('');
    } catch (err) { setError(errorOf(err)); }
  }, [page, status, search]);
  useEffect(() => { load(); }, [load]);

  return (
    <Page>
      <PageHeader
        title={superAdmin ? 'Tickets' : 'Report a Problem'}
        count={data?.open || undefined}
        subtitle={superAdmin
          ? 'Problems admins and moderators reported, and password requests from the sign-in page. Newest activity first.'
          : 'Tell the super admin about a problem with the console. You’re told in the bell when they answer.'}
        actions={!superAdmin && !writing && <Button variant="primary" icon="plus" onClick={() => setWriting(true)}>New ticket</Button>}
      />
      {error && <ErrorBanner onDismiss={() => setError('')}>{error}</ErrorBanner>}
      {writing && <NewTicket onCancel={() => setWriting(false)} onSent={(tk) => { setWriting(false); navigate(`/tickets/${tk._id}`); }} />}

      <Toolbar>
        <FilterTabs label="Status" value={status} onChange={(v) => { setStatus(v); setPage(1); }}
          options={[
            ...(superAdmin ? [] : [{ value: '', label: 'All' }]),
            { value: 'open', label: 'Open' },
            { value: 'inProgress', label: 'Being worked on' },
            { value: 'resolved', label: 'Resolved' },
            ...(superAdmin ? [{ value: '', label: 'All' }] : []),
          ]} />
        <SearchInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder={superAdmin ? 'Search by title, username or ticket number…' : 'Search your tickets…'} />
      </Toolbar>

      {!data ? <Loading label="Loading tickets…" />
        : data.tickets.length === 0 ? (
          <EmptyState icon="inbox" title={status === 'open' ? 'Nothing open' : 'No tickets here'}
            subtitle={superAdmin ? 'New ones show here, and in your bell.' : 'Use New ticket to report a problem.'} />
        ) : (
          <>
            <ul style={x.list} aria-label="Tickets">
              {data.tickets.map((tk) => {
                const cat = CATEGORY[tk.category] || CATEGORY.other;
                const st = TICKET_STATUS[tk.status] || TICKET_STATUS.open;
                return (
                  <li key={tk._id}>
                    <button type="button" style={x.row} onClick={() => navigate(`/tickets/${tk._id}`)}>
                      <span style={x.number}>#{tk.number}</span>
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span style={x.subject}>{tk.subject}</span>
                        <span style={x.meta}>
                          <Tag icon={cat.icon}>{cat.label}</Tag>
                          {superAdmin && <span>{tk.from?.username}{tk.from?.city ? ` · ${tk.from.city}` : ''}</span>}
                          <span>{tk.replyCount ? `${tk.replyCount} repl${tk.replyCount === 1 ? 'y' : 'ies'} · ` : ''}updated {timeAgo(tk.updatedAt)}</span>
                        </span>
                      </span>
                      <StatusPill tone={st.tone} icon={st.icon}>{st.label}</StatusPill>
                    </button>
                  </li>
                );
              })}
            </ul>
            {data.pages > 1 && <Pagination page={data.page} pages={data.pages} onChange={setPage} label="Ticket pages" />}
          </>
        )}
    </Page>
  );
}

function NewTicket({ onCancel, onSent }) {
  const ids = { cat: useId(), subj: useId(), msg: useId() };
  const [category, setCategory] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [tried, setTried] = useState(false);
  const [serverError, setServerError] = useState({});
  const [saving, setSaving] = useState(false);

  const errors = {};
  if (!category) errors.category = 'Choose what it’s about.';
  if (subject.trim().length < 3) errors.subject = 'Give it a short title (3 characters or more).';
  if (message.trim().length < 10) errors.message = 'Say what happened (10 characters or more).';
  const shown = { ...(tried ? errors : {}), ...serverError };

  const send = async (e) => {
    e.preventDefault();
    setTried(true);
    if (Object.keys(errors).length) return;
    setSaving(true);
    try {
      const tk = await ticketsAPI.create({ category, subject: subject.trim(), message: message.trim() });
      notify(`Ticket #${tk.number} is sent. You’ll be told in the bell when it’s answered.`, { tone: 'success' });
      onSent(tk);
    } catch (err) {
      const body = err?.response?.data;
      if (body?.field) setServerError({ [body.field]: body.message });
      else notify(errorOf(err), { tone: 'danger' });
    }
    setSaving(false);
  };

  const err = (k) => shown[k] && <p style={x.error}><Icon name="alert-circle" size={12} /> {shown[k]}</p>;
  return (
    <form style={x.card} onSubmit={send} noValidate aria-label="New ticket">
      <div style={x.formGrid}>
        <div>
          <label htmlFor={ids.cat} style={s.panelLabel}>What it’s about</label>
          <select id={ids.cat} value={category} onChange={(e) => { setCategory(e.target.value); setServerError({}); }}
            style={{ ...s.select, ...(shown.category ? x.invalid : null) }}>
            <option value="">Choose…</option>
            {SENDER_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY[c].label}</option>)}
          </select>
          {err('category')}
        </div>
        <div>
          <label htmlFor={ids.subj} style={s.panelLabel}>Title</label>
          <input id={ids.subj} className="modern-input" value={subject} maxLength={120}
            onChange={(e) => { setSubject(e.target.value); setServerError({}); }}
            placeholder="e.g. The spot map stays grey" style={{ ...s.select, cursor: 'text', ...(shown.subject ? x.invalid : null) }} />
          {err('subject')}
        </div>
      </div>
      <label htmlFor={ids.msg} style={{ ...s.panelLabel, display: 'block', marginTop: 12 }}>What happened</label>
      <textarea id={ids.msg} value={message} maxLength={2000} rows={5}
        onChange={(e) => { setMessage(e.target.value); setServerError({}); }}
        placeholder="What you did, what you expected, and what happened instead. Which spot or page, if it’s about one."
        style={{ ...s.textarea, ...(shown.message ? x.invalid : null) }} />
      {err('message')}
      <div style={{ ...s.buttonRow, justifyContent: 'flex-end' }}>
        <Button onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button type="submit" variant="primary" icon="send" disabled={saving}>{saving ? 'Sending…' : 'Send ticket'}</Button>
      </div>
    </form>
  );
}

export function TicketDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const superAdmin = isSuperAdmin();
  const [ticket, setTicket] = useState(null);
  const [error, setError] = useState('');
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState('');
  const [slip, setSlip] = useState(null);
  const replyId = useId();

  useEffect(() => {
    let live = true;
    ticketsAPI.get(id).then((tk) => { if (live) setTicket(tk); }).catch((err) => { if (live) setError(errorOf(err)); });
    return () => { live = false; };
  }, [id]);

  const run = async (key, fn) => {
    setBusy(key);
    try { await fn(); } catch (err) { notify(errorOf(err), { tone: 'danger' }); }
    setBusy('');
  };

  const send = (e) => {
    e.preventDefault();
    if (!reply.trim()) return;
    run('reply', async () => { setTicket(await ticketsAPI.reply(id, reply.trim())); setReply(''); });
  };
  const setStatus = (status) => run(status, async () => setTicket(await ticketsAPI.setStatus(id, status)));
  const newSlip = () => run('slip', async () => {
    const ok = await confirmAction(
      `Make a new temporary password for ${ticket.from.username}? Their old password stops working. Give them the slip in person or through your office’s own channel.`,
      { title: 'Make a new slip?', confirmText: 'Make a slip', tone: 'warning' },
    );
    if (!ok) return;
    const data = await ticketsAPI.resetPassword(id);
    setTicket(data.ticket);
    setSlip(data);
  });

  if (error) {
    return (
      <Page>
        <PageHeader title="Ticket" />
        <ErrorBanner>{error}</ErrorBanner>
        <div><Button icon="chevron-left" onClick={() => navigate('/tickets')}>All tickets</Button></div>
      </Page>
    );
  }
  if (!ticket) return <Page><Loading label="Loading the ticket…" /></Page>;

  const cat = CATEGORY[ticket.category] || CATEGORY.other;
  const st = TICKET_STATUS[ticket.status] || TICKET_STATUS.open;
  const passwordRequest = ticket.category === 'passwordReset';

  return (
    <Page>
      <div><Button size="sm" icon="chevron-left" onClick={() => navigate('/tickets')}>All tickets</Button></div>
      <PageHeader
        title={`#${ticket.number} · ${ticket.subject}`}
        subtitle={`${cat.label} · from ${ticket.from?.username || 'someone'}${ticket.from?.city ? ` (${ticket.from.city})` : ''} · ${fmtDateTime(ticket.createdAt)}`}
        actions={<StatusPill tone={st.tone} icon={st.icon}>{st.label}</StatusPill>}
      />

      {superAdmin && (
        <div style={x.card}>
          <div style={x.actionsRow}>
            {passwordRequest && ticket.status !== 'resolved' && (
              <Button variant="primary" icon="key" onClick={newSlip} disabled={busy === 'slip'}>Make a new slip</Button>
            )}
            {ticket.status !== 'inProgress' && ticket.status !== 'resolved' && (
              <Button icon="tool" onClick={() => setStatus('inProgress')} disabled={!!busy}>Mark as being worked on</Button>
            )}
            {ticket.status !== 'resolved'
              ? <Button variant="success" icon="check" onClick={() => setStatus('resolved')} disabled={!!busy}>Mark resolved</Button>
              : <Button icon="refresh-cw" onClick={() => setStatus('open')} disabled={!!busy}>Open again</Button>}
          </div>
          {passwordRequest && (
            <p style={x.note}>
              {ticket.from?.username} can’t sign in, so they won’t see replies here. Make a new slip and hand it to them; they choose their
              own password at the next sign-in.
            </p>
          )}
        </div>
      )}

      <ol style={x.thread} aria-label="Messages">
        <Message who={ticket.from} at={ticket.createdAt} text={ticket.message} first />
        {ticket.replies.map((r) => <Message key={r._id} who={r.by} at={r.at} text={r.message} />)}
      </ol>

      {!(passwordRequest && !superAdmin) && (
        <form style={x.card} onSubmit={send}>
          <label htmlFor={replyId} style={s.panelLabel}>{superAdmin ? 'Answer' : 'Add to this ticket'}</label>
          <textarea id={replyId} value={reply} onChange={(e) => setReply(e.target.value)} maxLength={2000} rows={3} style={s.textarea}
            placeholder={superAdmin ? 'What you found, or what you need from them.' : 'Anything more about the problem.'} />
          <div style={{ ...s.buttonRow, justifyContent: 'flex-end' }}>
            <Button type="submit" variant="primary" icon="send" disabled={busy === 'reply' || !reply.trim()}>
              {busy === 'reply' ? 'Sending…' : 'Send'}
            </Button>
          </div>
          {!superAdmin && ticket.status === 'resolved' && <p style={x.note}>Writing again opens the ticket again.</p>}
        </form>
      )}

      {slip && (
        <CredentialSlip kind="reset" account={slip.account} tempPassword={slip.tempPassword}
          expiresAt={slip.tempPasswordExpiresAt} onClose={() => setSlip(null)} />
      )}
    </Page>
  );
}

const ROLE = { superadmin: 'Super admin', admin: 'Admin', moderator: 'Moderator' };

function Message({ who, at, text, first }) {
  const fromSuper = who?.role === 'superadmin';
  return (
    <li style={{ ...x.message, ...(fromSuper ? x.messageSuper : null) }}>
      <div style={x.messageTop}>
        <strong style={{ color: t.textPrimary }}>{who?.username || 'Someone'}</strong>
        <span style={s.itemDate}>{ROLE[who?.role] || ''}{first ? ' · sent the ticket' : ''} · {fmtDateTime(at)}</span>
      </div>
      <p style={x.messageText}>{text}</p>
    </li>
  );
}

const x = {
  list:    { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 },
  row: {
    display: 'flex', alignItems: 'center', gap: 14, width: '100%', textAlign: 'left', cursor: 'pointer', flexWrap: 'wrap',
    padding: '14px 16px', borderRadius: radius.lg, border: `1px solid ${t.border}`, background: t.cardBg,
    fontFamily: 'inherit', color: 'inherit',
  },
  number:  { fontSize: 13, fontWeight: 700, color: t.textMuted, fontVariantNumeric: 'tabular-nums', minWidth: 34 },
  subject: { display: 'block', fontSize: 14, fontWeight: 700, color: t.textPrimary, overflowWrap: 'anywhere' },
  meta:    { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 5, fontSize: 12, color: t.textMuted },
  card:    { background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: radius.lg, padding: '16px 18px' },
  formGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px 16px' },
  // Shorthand, like the s.select / s.textarea it's spread over.
  invalid: { border: `1px solid ${t.danger}` },
  error:   { fontSize: 12, color: t.danger, margin: '5px 0 0', display: 'flex', alignItems: 'center', gap: 4 },
  actionsRow: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  note:    { fontSize: 12.5, color: t.textMuted, lineHeight: 1.5, margin: '10px 0 0' },
  thread:  { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 },
  message: { background: t.cardBg, borderWidth: 1, borderStyle: 'solid', borderColor: t.border, borderRadius: radius.lg, padding: '14px 16px' },
  messageSuper: { background: t.brandSoft, borderColor: 'transparent' },
  messageTop: { display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', fontSize: 13.5 },
  messageText: { fontSize: 14, color: t.textSecondary, lineHeight: 1.55, margin: '6px 0 0', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
};
