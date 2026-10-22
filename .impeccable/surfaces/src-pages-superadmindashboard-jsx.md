---
version: 1
slug: "src-pages-superadmindashboard-jsx"
primary_target: "src/pages/SuperAdminDashboard.jsx"
related_targets: ["src/pages/System.jsx","src/pages/Tickets.jsx","src/pages/Accounts.jsx","src/pages/ActivityLog.jsx","src/pages/Notifications.jsx","src/components/SuperShell.jsx"]
---

# Super admin console

Scope: the super admin's console in libot-admin-1 only (shell, Dashboard, System, Tickets and ticket detail, Accounts, Activity Log, Notifications, Change password). Admin and moderator consoles keep their current look. Mode: Operate.

Audience and job: the development team, checking the system through the day and on a projector at the thesis defense. Job: see whether the system is healthy and what waits on them, then act (maintenance, pause a role, notices, tools, accounts, tickets, activity).

Constraints: real figures only; nothing erased; super admin pages only; both light and dark themes; keyboard and screen-reader paths kept; plain copy, no em dashes.

User picks (2026-10-23): reference = another team's super admin console (dark banded headers with stat strips, grouped sidebar, dense tables with dark heads, live health panel, per-portal maintenance cards, profile menu), set up Libot's own way; Knewave for titles, brand and big numbers, Dongle for every other word; chart colours carried through; full width, no dead space; all four features (hero band + stat strip, live health panel, Ctrl K jump, top bar + profile menu).

## Direction contract

THESIS: A control room in Libot's own ink. Every count wears the hue of the chart it belongs to, so each page's stat strip is also the legend for that page. Refuses both the cream single-teal admin page and the generic navy dashboard.

OWN-WORLD: Shell, page bands and table heads in deep river-teal ink (#0C2A2D); content on pale sage (#EDF1EF) with white panels, hairline borders, no shadows. Knewave for page titles, the brand and big numerals; Dongle, size-adjusted, for every other word; monospace for times, IDs and measurements wherever they appear. Words in the stat strip (states, names) are Dongle bold, never Knewave. Panel heads: ink for live lists and tables, plain white for forms, charts and notes. Rows inside a panel are divided by hairlines, never boxed as cards. Six validated series hues: teal travelers, orange reviews, blue accounts, marigold tickets, violet system, magenta arrivals; slate for routine sign-ins. Libot yellow is the one main action.

STORY: Open the console, read health and waiting work in one glance, act in one click, and trust every number because each is real.

FIRST VIEWPORT: Dashboard at 1440: dark rail (brand in Knewave, Ctrl K jump, grouped links, account chip at the foot); thin top bar (rail toggle, bell with count, theme menu); full-width dark band with Knewave title, one live line (refreshed time, DB ping, uptime) and a six-cell stat strip, each cell a swatch-keyed label, a Knewave number and a 30-day column spark where history exists. Below, two columns: left two thirds holds Needs your attention and the 2x2 usage charts in their hues; right third holds the live health panel (DB ping sampled every 30 s this session), staff sign-ins and quick actions.

FORM: pinned by the user (reference console structure + Knewave/Dongle + chart colours), position 1 of 1. seed: none (roll skipped: the user pinned the direction, so no concept roll was made)

SIGNATURE: the legend strip. Swatch-keyed stat strips whose hues come back in the charts, role chips, activity tags and the activity-mix bar.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
