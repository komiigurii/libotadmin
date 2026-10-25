/*
 * Names for the activity log's actions (LibotBackend models/AuditLog.js), so
 * the Activity Log page and each account's history say the same thing.
 */
export const ACTION_LABELS = {
  'auth.login':              { label: 'Signed in',          icon: 'log-out',    tone: 'neutral' },
  'auth.logout':             { label: 'Signed out',         icon: 'log-out',    tone: 'neutral' },
  'auth.failed':             { label: 'Wrong password',     icon: 'alert-circle', tone: 'warning' },
  'auth.lockout':            { label: 'Locked out',         icon: 'lock',       tone: 'danger' },
  'auth.forgotPassword':     { label: 'Asked for a new password', icon: 'key',  tone: 'warning' },
  'account.unlock':          { label: 'Unlocked',           icon: 'key',        tone: 'success' },
  'account.create':          { label: 'Account made',       icon: 'plus',       tone: 'success' },
  'account.resetPassword':   { label: 'Password reset',     icon: 'key',        tone: 'warning' },
  'account.passwordChanged': { label: 'Password changed',   icon: 'key',        tone: 'info' },
  'account.delete':          { label: 'Deleted (archived)', icon: 'trash',      tone: 'danger' },
  'account.restore':         { label: 'Restored from the archive', icon: 'rotate-ccw', tone: 'success' },
  // Older entries, from before Delete (2026-10-24): the same actions.
  'account.deactivate':      { label: 'Deleted (archived)', icon: 'trash',      tone: 'danger' },
  'account.reactivate':      { label: 'Restored from the archive', icon: 'rotate-ccw', tone: 'success' },
  'account.municipality':    { label: 'Moved municipality', icon: 'move',       tone: 'info' },
  'traveler.warn':           { label: 'Warned',             icon: 'alert-triangle', tone: 'warning' },
  'traveler.suspend':        { label: 'Suspended',         icon: 'pause',      tone: 'warning' },
  'traveler.ban':            { label: 'Banned',             icon: 'slash',      tone: 'danger' },
  'traveler.unban':          { label: 'Ban lifted',         icon: 'check',      tone: 'success' },
  'traveler.unlock':         { label: 'Unlocked',           icon: 'key',        tone: 'success' },
  'traveler.restore':        { label: 'Restored from the archive', icon: 'rotate-ccw', tone: 'success' },
  'traveler.appealApproved': { label: 'Appeal approved',    icon: 'check',      tone: 'success' },
  'traveler.appealRejected': { label: 'Appeal rejected',    icon: 'x',          tone: 'danger' },
  'ticket.create':           { label: 'Ticket sent',        icon: 'flag',       tone: 'info' },
  'ticket.status':           { label: 'Ticket updated',     icon: 'flag',       tone: 'neutral' },
  'system.maintenanceStart': { label: 'Maintenance started', icon: 'tool',      tone: 'warning' },
  'system.maintenanceEnd':   { label: 'Maintenance ended',  icon: 'tool',       tone: 'success' },
  'system.restrictions':     { label: 'Access changed',     icon: 'pause',      tone: 'warning' },
  'system.notice':           { label: 'Notice published',   icon: 'send',       tone: 'info' },
  'system.noticeHidden':     { label: 'Notice taken down',  icon: 'x',          tone: 'neutral' },
  'system.clearCache':       { label: 'Cache cleared',      icon: 'refresh-cw', tone: 'neutral' },
};

export const actionLabel = (action) => ACTION_LABELS[action] || { label: action, icon: 'info', tone: 'neutral' };

/** The kind of an action: the part before the dot ('account.create' → 'account'). */
export const groupOf = (action = '') => String(action).split('.')[0];

// Each kind's series hue in the super admin's console (superadmin.css
// --s-*): sign-ins are routine, so slate rather than a hue; accounts blue,
// travelers teal, tickets marigold, the system violet.
export const GROUP_HUE = { auth: 'slate', account: 'blue', traveler: 'teal', ticket: 'marigold', system: 'violet' };
// The order the activity-mix bar stacks them in. Blue and teal must not touch
// (too alike side by side); this order passed the dataviz colour check.
export const MIX_ORDER = ['auth', 'account', 'ticket', 'traveler', 'system'];

// The Activity Log's filter groups (the part before the dot).
export const ACTION_GROUPS = [
  { value: '',         label: 'Everything' },
  { value: 'auth',     label: 'Sign-ins' },
  { value: 'account',  label: 'Accounts' },
  { value: 'traveler', label: 'Travelers' },
  { value: 'ticket',   label: 'Tickets' },
  { value: 'system',   label: 'System' },
];

/** What a staff account's status is called, and how it looks. */
export const STAFF_STATUS = {
  active:      { label: 'Active',                  tone: 'success', icon: 'check' },
  // Made or reset, and still on the slip's password.
  firstSignIn: { label: 'Temporary password',      tone: 'warning', icon: 'key' },
  slipExpired: { label: 'Slip expired',            tone: 'danger',  icon: 'clock' },
  locked:      { label: 'Locked',                  tone: 'danger',  icon: 'lock' },
  deleted:     { label: 'Deleted',                 tone: 'neutral', icon: 'trash' },
};
