import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ticketsAPI } from '../api/api';
import { useLive, useLiveTick } from '../api/live';
import {
  Page, PageHeader, Toolbar, SearchInput, Button, StatusPill, Tag, Loading, EmptyState, ErrorBanner,
  Table, Th, Td, pageStyles as s,
} from '../components/Layout';
import Pagination from '../components/Pagination';
import CredentialSlip from '../components/CredentialSlip';
import { notify, confirmAction } from '../components/AppAlert';
import Icon from '../components/Icon';
import { isSuperAdmin } from '../auth/roles';
import { theme as t, radius } from '../theme';
import { fmtDateTime, fmtNum, timeAgo } from '../utils/format';

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
  account:       { label: 'My account',              icon: 'shield' },
  request:       { label: 'A request or approval',   icon: 'inbox' },
  other:         { label: 'Something else',          icon: 'message-square' },
  passwordReset: { label: 'Forgot password',         icon: 'key' },
};
const SENDER_CATEGORIES = ['bug', 'account', 'request', 'other'];

export const TICKET_STATUS = {
  open:       { tone: 'warning', icon: 'clock',        label: 'Open' },
  inProgress: { tone: 'info',    icon: 'tool',         label: 'Being worked on' },
  resolved:   { tone: 'success', icon: 'check-circle', label: 'Resolved' },
};

const errorOf = (err) => err?.response?.data?.message || 'Couldn’t reach the server. Try again.';

export default function Tickets() {
  return isSuperAdmin() ? <TicketQueue /> : <ReportProblem />;
}

// ── The super admin's queue ─────────────────────────────────────────────────
// Laid out like the rest of the super admin's console (2026-10-23): the
// band's strip counts each status (and filters by it), a filter list at the
// left, and the tickets as one dense table.

const STATUS_ORDER = ['open', 'inProgress', 'resolved'];

function TicketQueue() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [counts, setCounts] = useState(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('open');
  const [category, setCategory] = useState('');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => { setSearch(query.trim()); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  // `quiet`: a live update; a failure keeps the list shown.
  const load = useCallback(async ({ quiet = false } = {}) => {
    try {
      setData(await ticketsAPI.list({ page, limit: 25, ...(status ? { status } : {}), ...(category ? { category } : {}), ...(search ? { q: search } : {}) }));
      setError('');
    } catch (err) { if (!quiet) setError(errorOf(err)); }
  }, [page, status, category, search]);
  useEffect(() => { load(); }, [load]);

  // How many in each status, and the open password requests: one small ask each.
  const loadCounts = useCallback(async () => {
    const total = (p) => ticketsAPI.list({ ...p, limit: 1 }).then((d) => d.total).catch(() => null);
    const [open, inProgress, resolved, all, passwords] = await Promise.all([
      total({ status: 'open' }), total({ status: 'inProgress' }), total({ status: 'resolved' }), total({}),
      total({ status: 'open', category: 'passwordReset' }),
    ]);
    setCounts({ open, inProgress, resolved, all, passwords });
  }, []);
  useEffect(() => { loadCounts(); }, [loadCounts]);
  // New tickets, replies and status changes, from anyone.
  useLive(['tickets'], () => { load({ quiet: true }); loadCounts(); });

  const pick = (s, c = category) => { setStatus(s); setCategory(c); setPage(1); };
  const n = (v) => (v == null ? '…' : fmtNum(v));
  const stats = [
    { label: 'Open', hue: 'marigold', value: n(counts?.open), tone: counts?.open ? 'warn' : undefined, hint: 'waiting on you', onClick: () => pick('open', ''), current: status === 'open' && !category },
    { label: 'Being worked on', hue: 'marigold', value: n(counts?.inProgress), hint: 'you’ve picked these up', onClick: () => pick('inProgress', ''), current: status === 'inProgress' && !category },
    { label: 'Resolved', hue: 'marigold', value: n(counts?.resolved), hint: 'answered and closed', onClick: () => pick('resolved', ''), current: status === 'resolved' && !category },
    { label: 'Password requests', hue: 'blue', value: n(counts?.passwords), tone: counts?.passwords ? 'warn' : undefined, hint: 'open, from the sign-in page', onClick: () => pick('open', 'passwordReset'), current: category === 'passwordReset' },
    { label: 'All tickets', value: n(counts?.all), hint: 'since tickets began', onClick: () => pick('', ''), current: !status && !category },
  ];

  const statusLabel = status ? TICKET_STATUS[status].label : 'All';
  return (
    <Page>
      <PageHeader
        title="Tickets"
        stats={stats}
      />
      {error && <ErrorBanner onDismiss={() => setError('')}>{error}</ErrorBanner>}

      <div className="sa-grid sa-rail-split">
        <aside className="sa-panel sa-filters" aria-label="Filter tickets">
          <div className="sa-filter-group" role="group" aria-label="Status">
            <div className="sa-filter-label">Status</div>
            {[...STATUS_ORDER, ''].map((st) => (
              <button key={st || 'all'} type="button" className="sa-filter" aria-pressed={status === st} onClick={() => pick(st)}>
                <Icon name={st ? TICKET_STATUS[st].icon : 'inbox'} size={15} />
                {st ? TICKET_STATUS[st].label : 'All'}
                <span className={`sa-filter-n${st === 'open' && counts?.open ? ' flag' : ''}`}>{counts ? n(st ? counts[st] : counts.all) : ''}</span>
              </button>
            ))}
          </div>
          <div className="sa-filter-group" role="group" aria-label="Technical Problems">
            <div className="sa-filter-label">Technical Problems</div>
            {['', ...Object.keys(CATEGORY)].map((c) => (
              <button key={c || 'any'} type="button" className="sa-filter" aria-pressed={category === c} onClick={() => pick(status, c)}>
                <Icon name={c ? CATEGORY[c].icon : 'message-square'} size={15} />
                {c ? CATEGORY[c].label : 'All'}
              </button>
            ))}
          </div>
        </aside>

        <div className="sa-col">
          <Toolbar>
            <span style={x.scope}>{statusLabel}{category ? ` · ${CATEGORY[category].label}` : ''}{data ? ` · ${fmtNum(data.total)}` : ''}</span>
            <SearchInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by title, username or ticket number…" />
          </Toolbar>
          {!data ? <Loading label="Loading tickets…" cols={7} />
            : data.tickets.length === 0 ? (
              <EmptyState icon="inbox" title={status === 'open' ? 'Nothing open' : 'No tickets here'}
                subtitle="New ones show here, and in your bell." />
            ) : (
              <>
                <Table caption="Tickets" head={<><Th width={64}>No.</Th><Th>Ticket</Th><Th>About</Th><Th>From</Th><Th align="right">Replies</Th><Th>Updated</Th><Th>Status</Th></>}>
                  {data.tickets.map((tk) => {
                    const cat = CATEGORY[tk.category] || CATEGORY.other;
                    const st = TICKET_STATUS[tk.status] || TICKET_STATUS.open;
                    return (
                      <tr key={tk._id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/tickets/${tk._id}`)}>
                        <Td><span className="sa-mono" style={{ color: t.textMuted }}>#{tk.number}</span></Td>
                        <Td>
                          <Link to={`/tickets/${tk._id}`} style={x.subjectLink} onClick={(e) => e.stopPropagation()}>{tk.subject}</Link>
                        </Td>
                        <Td><Tag icon={cat.icon}>{cat.label}</Tag></Td>
                        <Td>
                          <div style={s.personName}>{tk.from?.username || '—'}</div>
                          <div style={s.personSub}>{tk.from?.city || (tk.from?.role === 'admin' ? 'Admin' : '')}</div>
                        </Td>
                        <Td align="right">{fmtNum(tk.replyCount || 0)}</Td>
                        <Td muted style={{ whiteSpace: 'nowrap' }}><span className="sa-mono" title={fmtDateTime(tk.updatedAt)}>{timeAgo(tk.updatedAt)}</span></Td>
                        <Td><StatusPill tone={st.tone} icon={st.icon}>{st.label}</StatusPill></Td>
                      </tr>
                    );
                  })}
                </Table>
                {data.pages > 1 && <Pagination page={data.page} pages={data.pages} onChange={setPage} label="Ticket pages" />}
              </>
            )}
        </div>
      </div>
    </Page>
  );
}

// ── An admin's or a moderator's Report a Problem ────────────────────────────

function ReportProblem() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [writing, setWriting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => { setSearch(query.trim()); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  // `quiet`: a live update (the super admin answered); a failure keeps the list.
  const load = useCallback(async ({ quiet = false } = {}) => {
    try {
      setData(await ticketsAPI.list({ page, limit: 20, ...(status ? { status } : {}), ...(search ? { q: search } : {}) }));
      setError('');
    } catch (err) { if (!quiet) setError(errorOf(err)); }
  }, [page, status, search]);
  useEffect(() => { load(); }, [load]);
  useLive(['tickets'], () => load({ quiet: true }));

  // How many of yours in each status, one small ask each, as on the super
  // admin's queue; the strip's cells filter the list below.
  const [counts, setCounts] = useState(null);
  const loadCounts = useCallback(async () => {
    const total = (p) => ticketsAPI.list({ ...p, limit: 1 }).then((d) => d.total).catch(() => null);
    const [open, inProgress, resolved, all] = await Promise.all([
      total({ status: 'open' }), total({ status: 'inProgress' }), total({ status: 'resolved' }), total({}),
    ]);
    setCounts({ open, inProgress, resolved, all });
  }, []);
  useEffect(() => { loadCounts(); }, [loadCounts]);
  useLive(['tickets'], () => { loadCounts(); });

  const pick = (st) => { setStatus(st); setPage(1); };
  const n = (v) => (v == null ? '…' : fmtNum(v));
  const stats = [
    { label: 'Open', hue: 'marigold', value: n(counts?.open), hint: 'waiting for the super admin', onClick: () => pick('open'), current: status === 'open' },
    { label: 'Being worked on', hue: 'marigold', value: n(counts?.inProgress), hint: 'the super admin picked these up', onClick: () => pick('inProgress'), current: status === 'inProgress' },
    { label: 'Resolved', hue: 'marigold', value: n(counts?.resolved), hint: 'answered and closed', onClick: () => pick('resolved'), current: status === 'resolved' },
    { label: 'All your tickets', value: n(counts?.all), hint: 'everything you’ve sent', onClick: () => pick(''), current: !status },
  ];

  return (
    <Page>
      <PageHeader
        title="Report a Problem"
        stats={stats}
        statsLabel="Your tickets by status"
        actions={!writing && <Button variant="primary" icon="plus" onClick={() => setWriting(true)}>New ticket</Button>}
      />
      {error && <ErrorBanner onDismiss={() => setError('')}>{error}</ErrorBanner>}
      {writing && <NewTicket onCancel={() => setWriting(false)} onSent={(tk) => { setWriting(false); navigate(`/tickets/${tk._id}`); }} />}

      <Toolbar>
        <span style={x.scope}>{status ? TICKET_STATUS[status].label : 'All'}{data ? ` · ${fmtNum(data.total)}` : ''}</span>
        <SearchInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your tickets by title or number…" />
      </Toolbar>

      {!data ? <Loading label="Loading tickets…" cols={6} />
        : data.tickets.length === 0 ? (
          <EmptyState icon="inbox" title={status === 'open' ? 'Nothing open' : 'No tickets here'}
            subtitle="Use New ticket to report a problem." />
        ) : (
          <>
            <Table caption="Your tickets" head={<><Th width={64}>No.</Th><Th>Ticket</Th><Th>About</Th><Th align="right">Replies</Th><Th>Updated</Th><Th>Status</Th></>}>
              {data.tickets.map((tk) => {
                const cat = CATEGORY[tk.category] || CATEGORY.other;
                const st = TICKET_STATUS[tk.status] || TICKET_STATUS.open;
                return (
                  <tr key={tk._id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/tickets/${tk._id}`)}>
                    <Td><span className="sa-mono" style={{ color: t.textMuted }}>#{tk.number}</span></Td>
                    <Td>
                      <Link to={`/tickets/${tk._id}`} style={x.subjectLink} onClick={(e) => e.stopPropagation()}>{tk.subject}</Link>
                    </Td>
                    <Td><Tag icon={cat.icon}>{cat.label}</Tag></Td>
                    <Td align="right">{fmtNum(tk.replyCount || 0)}</Td>
                    <Td muted style={{ whiteSpace: 'nowrap' }}><span className="sa-mono" title={fmtDateTime(tk.updatedAt)}>{timeAgo(tk.updatedAt)}</span></Td>
                    <Td><StatusPill tone={st.tone} icon={st.icon}>{st.label}</StatusPill></Td>
                  </tr>
                );
              })}
            </Table>
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
    <form className="sa-panel" style={{ padding: '14px 16px' }} onSubmit={send} noValidate aria-label="New ticket">
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

  // A reply or a status change from the other side shows as it happens; the
  // reply being typed stays. Once this ticket is shown, a failed reload keeps it.
  const changed = useLiveTick(['tickets']);
  const shownId = useRef(null);
  useEffect(() => {
    let live = true;
    ticketsAPI.get(id)
      .then((tk) => { if (live) { setTicket(tk); shownId.current = id; } })
      .catch((err) => { if (live && shownId.current !== id) setError(errorOf(err)); });
    return () => { live = false; };
  }, [id, changed]);

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
    const to = ticket.contactEmail;
    const ok = await confirmAction(
      to
        ? `Make a new temporary password for ${ticket.from.username}? Their old password stops working, and the slip is emailed to ${to}. Make sure that address is really theirs.`
        : `Make a new temporary password for ${ticket.from.username}? Their old password stops working. Give them the slip in person or through your office’s own channel.`,
      { title: 'Make a new slip?', confirmText: to ? 'Make and email the slip' : 'Make a slip', tone: 'warning' },
    );
    if (!ok) return;
    const data = await ticketsAPI.resetPassword(id);
    setTicket(data.ticket);
    setSlip({ ...data, email: data.emailedTo || data.emailFailed ? { to: data.emailedTo || to, sent: !!data.emailedTo } : null });
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
  if (!ticket) return <Page><Loading label="Loading the ticket…" kind="thread" /></Page>;

  const cat = CATEGORY[ticket.category] || CATEGORY.other;
  const st = TICKET_STATUS[ticket.status] || TICKET_STATUS.open;
  const passwordRequest = ticket.category === 'passwordReset';

  // The ticket's facts in the band's strip, its actions in the band, and the
  // answer box beside the thread. The super admin answers and sets the
  // status; the admin or moderator who sent it can add to it.
  const replies = ticket.replies.length;
  const stats = [
    { label: 'Status', small: true, value: st.label, tone: ticket.status === 'resolved' ? 'good' : ticket.status === 'open' ? 'warn' : undefined },
    { label: 'About', hue: passwordRequest ? 'blue' : 'marigold', small: true, value: cat.label },
    ...(superAdmin ? [{ label: 'From', small: true, value: ticket.from?.username || 'someone', hint: ticket.from?.city || ROLE[ticket.from?.role] || '' }] : []),
    { label: 'Sent', small: true, value: timeAgo(ticket.createdAt), hint: <span className="sa-mono">{fmtDateTime(ticket.createdAt)}</span> },
    { label: 'Replies', value: fmtNum(replies), hint: replies ? <>last <span className="sa-mono">{timeAgo(ticket.replies[replies - 1].at)}</span></> : 'none yet' },
  ];
  const back = <Button icon="chevron-left" onClick={() => navigate('/tickets')}>All tickets</Button>;
  return (
    <Page>
      <PageHeader
        title={`#${ticket.number} · ${ticket.subject}`}
        stats={stats}
        actions={superAdmin ? <>
          {back}
          {passwordRequest && ticket.status !== 'resolved' && (
            <Button variant="primary" icon="key" onClick={newSlip} disabled={busy === 'slip'}>Make a new slip</Button>
          )}
          {ticket.status !== 'inProgress' && ticket.status !== 'resolved' && (
            <Button icon="tool" onClick={() => setStatus('inProgress')} disabled={!!busy}>Mark as being worked on</Button>
          )}
          {ticket.status !== 'resolved'
            ? <Button variant="success" icon="check" onClick={() => setStatus('resolved')} disabled={!!busy}>Mark resolved</Button>
            : <Button icon="refresh-cw" onClick={() => setStatus('open')} disabled={!!busy}>Open again</Button>}
        </> : back}
      />
      <div className="sa-grid sa-split">
        <div className="sa-col">
          <ol style={x.thread} aria-label="Messages">
            <Message who={ticket.from} at={ticket.createdAt} text={ticket.message} first />
            {ticket.replies.map((r) => <Message key={r._id} who={r.by} at={r.at} text={r.message} />)}
          </ol>
          {superAdmin && passwordRequest && (
            <section className="sa-panel" aria-label="About password requests">
              <div className="sa-panel-head"><h2 className="sa-panel-title"><Icon name="key" size={16} /> A password request</h2></div>
              {ticket.contactEmail ? (
                <div style={{ padding: '12px 16px 14px' }}>
                  <div style={x.slipTo}>
                    <Icon name="mail" size={15} color={t.brand} />
                    <span>Slip goes to <strong style={{ color: t.textPrimary }}>{ticket.contactEmail}</strong></span>
                  </div>
                  <p style={{ ...x.note, margin: '8px 0 0' }}>
                    They confirmed this address with a code, so it’s theirs to read, but anyone who knows a username can ask. Check
                    it really belongs to {ticket.from?.username} (for example, call their office), then make a new slip: it’s emailed
                    there and shown to you once. They choose their own password at the next sign-in.
                  </p>
                </div>
              ) : (
                <p style={{ ...x.note, margin: 0, padding: '12px 16px 14px' }}>
                  {ticket.from?.username} can’t sign in, so they won’t see replies here. Make a new slip and hand it to them; they
                  choose their own password at the next sign-in. The slip shows the new temporary password once.
                </p>
              )}
            </section>
          )}
        </div>
        <div className="sa-col">
          {superAdmin ? (
            <form className="sa-panel" style={{ padding: '14px 16px' }} onSubmit={send}>
              <label htmlFor={replyId} style={s.panelLabel}>Answer</label>
              <textarea id={replyId} value={reply} onChange={(e) => setReply(e.target.value)} maxLength={2000} rows={6} style={s.textarea}
                placeholder="What you found, or what you need from them." />
              <div style={{ ...s.buttonRow, justifyContent: 'flex-end' }}>
                <Button type="submit" variant="primary" icon="send" disabled={busy === 'reply' || !reply.trim()}>
                  {busy === 'reply' ? 'Sending…' : 'Send'}
                </Button>
              </div>
              <p style={x.note}>{ticket.from?.username || 'They'} {passwordRequest ? 'can’t read this until they can sign in again.' : 'is told in their bell.'}</p>
            </form>
          ) : !passwordRequest && (
            <form className="sa-panel" style={{ padding: '14px 16px' }} onSubmit={send}>
              <label htmlFor={replyId} style={s.panelLabel}>Add to this ticket</label>
              <textarea id={replyId} value={reply} onChange={(e) => setReply(e.target.value)} maxLength={2000} rows={6} style={s.textarea}
                placeholder="Anything more about the problem." />
              <div style={{ ...s.buttonRow, justifyContent: 'flex-end' }}>
                <Button type="submit" variant="primary" icon="send" disabled={busy === 'reply' || !reply.trim()}>
                  {busy === 'reply' ? 'Sending…' : 'Send'}
                </Button>
              </div>
              <p style={x.note}>
                {ticket.status === 'resolved' ? 'Writing again opens the ticket again.' : 'The super admin is told; their answer comes to your bell.'}
              </p>
            </form>
          )}
        </div>
      </div>
      {slip && (
        <CredentialSlip kind="reset" account={slip.account} tempPassword={slip.tempPassword}
          expiresAt={slip.tempPasswordExpiresAt} email={slip.email} onClose={() => setSlip(null)} />
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
        <span style={s.itemDate}>{ROLE[who?.role] || ''}{first ? ' · sent the ticket' : ''} · <span className="sa-mono">{fmtDateTime(at)}</span></span>
      </div>
      <p style={x.messageText}>{text}</p>
    </li>
  );
}

const x = {
  scope:   { fontSize: 15, fontWeight: 700, color: t.textPrimary, whiteSpace: 'nowrap' },
  subjectLink: { fontSize: 14, fontWeight: 700, color: t.textPrimary, textDecoration: 'none', overflowWrap: 'anywhere' },
  formGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px 16px' },
  // Shorthand, like the s.select / s.textarea it's spread over.
  invalid: { border: `1px solid ${t.danger}` },
  error:   { fontSize: 12, color: t.danger, margin: '5px 0 0', display: 'flex', alignItems: 'center', gap: 4 },
  actionsRow: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  note:    { fontSize: 12.5, color: t.textMuted, lineHeight: 1.5, margin: '10px 0 0' },
  slipTo:  { display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: t.textSecondary, overflowWrap: 'anywhere' },
  thread:  { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 },
  message: { background: t.cardBg, borderWidth: 1, borderStyle: 'solid', borderColor: t.border, borderRadius: radius.lg, padding: '14px 16px' },
  messageSuper: { background: t.brandSoft, borderColor: 'transparent' },
  messageTop: { display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', fontSize: 13.5 },
  messageText: { fontSize: 14, color: t.textSecondary, lineHeight: 1.55, margin: '6px 0 0', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
};
