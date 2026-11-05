// What each kind of notification is called and its series hue (console.css),
// for the bell's dropdown and the Notifications page.
export const NOTICE_KIND = {
  maintenance: { icon: 'tool',           label: 'System',       hue: 'violet' },
  update:      { icon: 'sparkle',        label: 'Update',       hue: 'violet' },
  account:     { icon: 'shield',         label: 'Your account', hue: 'blue' },
  ticket:      { icon: 'message-square', label: 'Ticket',       hue: 'marigold' },
  request:     { icon: 'send',           label: 'Request',      hue: 'slate' },
  // A traveler reported by another (User Management → Reported).
  report:      { icon: 'flag',           label: 'Report',       hue: 'teal' },
  // Since 2026-11-05 every staff action is in the bell too (backend
  // utils/actionNotices.js).
  appeal:      { icon: 'flag',           label: 'Appeal',       hue: 'teal' },
  traveler:    { icon: 'user',           label: 'Traveler',     hue: 'teal' },
  spot:        { icon: 'map-pin',        label: 'Spot',         hue: 'orange' },
  badge:       { icon: 'star',           label: 'Badge',        hue: 'orange' },
  review:      { icon: 'message-square', label: 'Review',       hue: 'magenta' },
  staff:       { icon: 'users',          label: 'Staff account', hue: 'blue' },
};

export const noticeKind = (kind) => NOTICE_KIND[kind] || NOTICE_KIND.update;
