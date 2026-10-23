# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

React 19 + Vite single-page console, deployed on Vercel (libotadmin.vercel.app) from `main`, talking to the Libot backend on Render. Used on desktop and laptop screens first (1366 to 1920 wide), and must still work on a tablet and a phone.

## Users

Three staff roles sign in with a username the system gave them (no self sign-up):

- **Super admin:** the development team. Runs the system itself: maintenance, pausing a role, update notices, the server tools, every account (staff and travelers), the staff's tickets and the activity log. Its console holds only those pages (user rule, 2026-10-22).
- **Admin:** the provincial tourism side. Spots (with the moderators' approval queue), Rate and Review, traveler progress, town badges, suspensions and bans, moderators.
- **Moderator:** one per municipality. Proposes changes to their own town's spots and tracks their submissions; read-only list of travelers who visited their town.

The thesis defense panel also evaluates the console; its notes drive changes.

## Product Purpose

The back office of Libot Bulacan, the app that gets people to visit Bulacan's heritage spots in person. Staff keep spot content accurate and approved, keep the community civil, and keep the system running. Success for the super admin console is knowing at a glance whether the system is healthy and what is waiting on them, and acting on it without a developer's machine.

## Positioning

Nothing reaches travelers without approval, and nothing is erased: accounts are archived, staff accounts are deactivated, every console action is logged. Staff accounts are made with server-made temporary passwords handed over on a printed credential slip.

## Operating Context

- Used at a desk for long stretches; the super admin checks in throughout the day and during the thesis defense, often on a projector.
- The backend sleeps when idle (free tier earlier, Hobby plan now): the first request can take up to a minute, so loading states say why.
- Maintenance makes the console read-only for admins and moderators only; travelers are never affected (user rule, 2026-10-23).
- Light, dark and "follow the system" themes, chosen per browser.

## Capabilities and Constraints

**Super admin capabilities:** dashboard (system state, open tickets, locked accounts, accounts on a temporary password, usage charts, recent activity); System (maintenance with message, expected end and a required summary; pause admins or moderators; update notices; clear cache; server health; unlock accounts; maintenance log); Tickets (answer, set status, turn a forgot-password ticket into a new credential slip); Accounts (staff: make, reset password, deactivate/reactivate, move town, history; travelers: search, standing, overview); Activity Log (filter by kind, search); Notifications (the bell).

**Constraints:**
- Super admin console shows only super admin functions; never re-add spots, reviews or travelers moderation pages to it.
- Usernames are permanent; a moderator's name comes from the town.
- Never delete accounts; never show passwords except once on the slip.
- Copy in plain English, no em dashes, wording: traveler (not user), review, Reject.
- Real figures only: no invented counts, trends or deltas the backend doesn't return.

**Terminology:** spot, town (municipality), ticket, credential slip, maintenance, update notice, standing (good standing, muted, suspended, banned, deactivated).

## Brand Commitments

- Name: **Libot Bulacan**. Logo: the yellow rounded square with a white eight-point compass star (`src/assets/logo.png`).
- Voice: plain, honest and specific; say what happened and what to do next.
- Not an official government or tourism-office tool, and must not look like one.
- The user rejects generic "AI-made" interfaces; lead with real data and specific wording.
- Super admin console type (user, 2026-10-23): **Knewave** for page titles, the brand and big numbers; **Dongle** for all other text. Layout reference: a dark-banded super admin console with stat strips, dense tables and a live health panel, set up Libot's own way, using the full width with no dead space, and chart colours carried through the interface.

## Evidence on Hand

- Live data through the backend: staff accounts, travelers, tickets, activity log, maintenance log, update notices, usage series (signups, arrivals, reviews, active travelers per day), server health (database ping, uptime, memory, commit).
- 23 live spots in 7 towns; traveler progress was reset on 2026-10-20, so most usage figures are small. Never pad them.

## Product Principles

1. **Say the state plainly.** Whether the system is healthy and what waits on the super admin should be readable in one glance.
2. **Real numbers or none.** Show what the backend returns; a missing figure reads as missing, not zero.
3. **Nothing is erased.** Deactivate, archive, log; the interface never offers deletion of people.
4. **Each console holds its own work.** The super admin's pages are about the system and its accounts, not content moderation.

## Accessibility & Inclusion

Every text and background pair passes WCAG AA in both light and dark themes. Keyboard reachable throughout (skip link, visible focus, aria-current on the page you're on). Reduced motion stills animations. Tables scroll inside their region on narrow screens.
