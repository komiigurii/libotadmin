---
name: Libot Bulacan Super Admin Console
description: A control room in Libot's own ink, where every count wears the hue of the chart it belongs to.
colors:
  river-ink: "#0C2A2D"
  river-ink-raised: "#143A3E"
  river-ink-active: "#1D4A4F"
  shell-text: "#EAF4F2"
  shell-muted: "#A9C4C1"
  shell-faint: "#86A6A3"
  table-head-text: "#DCEBE8"
  libot-yellow: "#F2CE1B"
  on-yellow: "#2C2810"
  libot-teal: "#0A6F78"
  sage-paper: "#EDF1EF"
  sage-wash: "#F2F6F4"
  panel-white: "#FFFFFF"
  panel-hover: "#F3F7F5"
  border: "#D3DEDB"
  divider: "#E1E9E6"
  ink-text: "#0F2120"
  text-secondary: "#384D4B"
  text-muted: "#4F6563"
  series-teal: "#008E9B"
  series-orange: "#E0662C"
  series-blue: "#2F6FD0"
  series-marigold: "#C58800"
  series-violet: "#6B52D6"
  series-magenta: "#CF4E8A"
  series-slate: "#7D8F8D"
  series-teal-dark: "#1C9CA6"
  series-orange-dark: "#D8692F"
  series-blue-dark: "#3F80DC"
  series-marigold-dark: "#B8850A"
  series-violet-dark: "#8875E4"
  series-magenta-dark: "#CF5C91"
  series-slate-dark: "#7D9593"
  success: "#16764F"
  warning: "#8A5610"
  danger: "#B3352C"
  band-success: "#5FD69A"
  band-warning: "#F0C264"
  band-danger: "#F58E8E"
  dark-paper: "#0A181A"
  dark-panel: "#102629"
  dark-panel-hover: "#142E31"
  dark-border: "#23403F"
  dark-divider: "#1B3537"
  dark-text: "#E8F2F0"
  dark-text-secondary: "#B0C6C3"
  dark-text-muted: "#93ACA9"
  dark-shell: "#061315"
  dark-band: "#0D2A2E"
  dark-table-head: "#061416"
typography:
  display:
    fontFamily: "'Knewave Libot', 'Dongle Libot', system-ui, sans-serif"
    fontSize: "36px"
    fontWeight: 400
    lineHeight: 1.02
    letterSpacing: "0.005em"
  numeral:
    fontFamily: "'Knewave Libot', 'Dongle Libot', system-ui, sans-serif"
    fontSize: "34px"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "0.01em"
  brand:
    fontFamily: "'Knewave Libot', 'Dongle Libot', system-ui, sans-serif"
    fontSize: "21px"
    fontWeight: 400
    lineHeight: 1.05
    letterSpacing: "0.005em"
  strip-word:
    fontFamily: "'Dongle Libot', 'Schibsted Grotesk Variable', system-ui, sans-serif"
    fontSize: "25px"
    fontWeight: 700
    lineHeight: 1.05
  title:
    fontFamily: "'Dongle Libot', 'Schibsted Grotesk Variable', system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 700
  body:
    fontFamily: "'Dongle Libot', 'Schibsted Grotesk Variable', system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
  label:
    fontFamily: "'Dongle Libot', 'Schibsted Grotesk Variable', system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 700
    letterSpacing: "0.05em"
  mono:
    fontFamily: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace"
    fontSize: "12.5px"
    fontWeight: 400
    fontFeature: "tnum"
rounded:
  swatch: "3px"
  chip: "6px"
  item: "8px"
  control: "9px"
  button: "10px"
  strip: "10px"
  menu: "12px"
  panel: "14px"
  band: "14px"
  pill: "999px"
spacing:
  hairline: "1px"
  xs: "4px"
  sm: "8px"
  md: "12px"
  page-gap: "16px"
  page-x: "18px"
  band-x: "24px"
components:
  button-primary:
    backgroundColor: "{colors.libot-yellow}"
    textColor: "{colors.on-yellow}"
    rounded: "{rounded.button}"
    padding: "8px 15px"
    height: "36px"
  button-secondary:
    backgroundColor: "{colors.panel-white}"
    textColor: "{colors.ink-text}"
    rounded: "{rounded.button}"
    padding: "8px 15px"
    height: "36px"
  page-band:
    backgroundColor: "{colors.river-ink}"
    textColor: "{colors.shell-text}"
    typography: "{typography.display}"
    rounded: "{rounded.band}"
    padding: "22px 24px 20px"
  stat-cell:
    backgroundColor: "{colors.river-ink}"
    textColor: "{colors.shell-text}"
    typography: "{typography.numeral}"
    padding: "13px 15px 12px"
  stat-cell-hover:
    backgroundColor: "{colors.river-ink-raised}"
  panel:
    backgroundColor: "{colors.panel-white}"
    textColor: "{colors.ink-text}"
    rounded: "{rounded.panel}"
  panel-head-ink:
    backgroundColor: "{colors.river-ink}"
    textColor: "{colors.table-head-text}"
    typography: "{typography.title}"
    padding: "11px 16px"
  panel-head-plain:
    backgroundColor: "{colors.panel-white}"
    textColor: "{colors.ink-text}"
    typography: "{typography.title}"
    padding: "11px 16px"
  rail-link:
    backgroundColor: "{colors.river-ink}"
    textColor: "{colors.shell-muted}"
    rounded: "{rounded.control}"
    padding: "7px 10px"
    height: "40px"
  rail-link-hover:
    backgroundColor: "{colors.river-ink-raised}"
    textColor: "{colors.shell-text}"
  rail-link-active:
    backgroundColor: "{colors.river-ink-active}"
    textColor: "{colors.shell-text}"
  table-head:
    backgroundColor: "{colors.river-ink}"
    textColor: "{colors.table-head-text}"
    typography: "{typography.label}"
  filter-item:
    backgroundColor: "{colors.panel-white}"
    textColor: "{colors.text-secondary}"
    padding: "8px 14px"
    height: "40px"
  role-chip:
    backgroundColor: "{colors.panel-white}"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.chip}"
    padding: "1px 9px 1px 7px"
  count-badge:
    backgroundColor: "{colors.libot-yellow}"
    textColor: "{colors.on-yellow}"
    rounded: "{rounded.pill}"
    height: "20px"
---

# Design System: Libot Bulacan Super Admin Console

## Overview

**Creative North Star: "The Legend Strip Control Room"**

The super admin console is the development team's control room, read through the day and on a projector at the thesis defense. It wraps full-width pages in deep river-teal ink: the rail, the top bar, every page's opening band and every table head share that one ink, so the frame reads as one instrument. Content sits on pale sage paper in white panels with hairline borders and no shadows. Density is high and deliberate: dense tables, stat strips, a live health panel, small multiples of the usage charts.

The system's spine is its series hues. Each kind of thing (travelers, reviews, accounts, tickets, the system, spot arrivals) owns one validated hue, and that hue comes back everywhere the thing appears: the swatch beside a stat-strip label, the bars of its chart, the tag in the activity feed, its segment of the activity-mix bar. A page's stat strip is therefore also the legend for that page. Text never wears a series hue; a swatch beside the words carries the identity.

Type is loud at the top and quiet below. Knewave, a brush display face, sets page titles, the brand and big numerals only; Dongle, size-adjusted to read like a normal UI sans, sets every other word; monospace carries times, IDs and measurements. Libot yellow is the one primary action on any screen. The console refuses both the cream single-teal admin page and the generic navy dashboard.

**Key Characteristics:**
- Ink frame (rail, top bar, page band, table heads) around sage paper and white panels.
- Six validated series hues plus slate, one per kind of thing, identical in strip, chart, tag and mix bar.
- Knewave for titles, brand and numerals; Dongle for words; monospace for times, IDs and measurements.
- Flat panels with hairlines; only menus and dialogs float.
- Full width, no max-width; panels in a two-column split that collapses in priority order.
- Light and dark themes, both holding WCAG AA on every text pair.

## Colors

A two-ground palette (ink frame, sage paper) carrying a categorical set of six series hues, with status colours and Libot yellow kept strictly apart from them.

### Primary
- **Libot Yellow** (libot-yellow, with on-yellow text): the one primary action on a screen (Publish notice, Add an account), the unread and waiting count badges, the account avatar, the band's count pill. Never decoration, never a second button on the same screen.
- **River Ink** (river-ink): the shell, the page band, the strip cells and the table heads. In the light theme the rail and band are the same ink; in the dark theme the rail sinks to dark-shell and the band lifts to dark-band so it still reads as a band against dark-paper. Raised (river-ink-raised) is hover; active (river-ink-active) is the current rail link and the current strip cell.

### Secondary
- **Libot Teal** (libot-teal): inherited from the incumbent `--brand`. Links in white panel heads, the caret, the menu check, and the soft tint on the selected filter and the selected jump result. It is a brand colour, not a series hue.

### Tertiary: series hues
Light steps validated on white; dark steps (`-dark`) validated on #11262A and on river-ink. The dark steps also serve as the swatches on the ink band in both themes (`--k-*`).
- **Series Teal**: travelers (travelers using the app, traveler actions).
- **Series Orange**: reviews.
- **Series Blue**: staff accounts and new accounts.
- **Series Marigold**: tickets.
- **Series Violet**: the system (maintenance, notices, access, cache).
- **Series Magenta**: spot arrivals.
- **Series Slate**: routine sign-ins; deliberately not a hue.

Usage charts bind through `--chart-active` (teal), `--chart-signups` (blue), `--chart-arrivals` (magenta) and `--chart-reviews` (orange).

### Neutral
- **Sage Paper** (sage-paper): the page ground. Sage Wash (sage-wash) is the secondary ground under neutral pills and tags.
- **Panel White** (panel-white) with Panel Hover (panel-hover): every content panel, menu and dialog.
- **Border** and **Divider**: the panel edge and the hairline between rows.
- **Ink Text**, **Text Secondary**, **Text Muted**: the text ladder on paper. Muted on sage paper holds 5.46:1.
- **Shell Text**, **Shell Muted**, **Shell Faint**: the text ladder on ink. Muted holds 8.2:1 and faint 5.78:1 on river-ink. Table Head Text sets column heads.
- **Dark theme**: dark-paper, dark-panel, dark-panel-hover, dark-border, dark-divider and the dark text ladder replace their light counterparts; dark muted on dark-panel holds 6.55:1. All 31 text and background pairs pass WCAG AA in both themes.

### Status
- **Success / Warning / Danger** (success, warning, danger on paper; band-success, band-warning, band-danger on the ink band and in the dark theme): states only. A warning stat cell turns its number band-warning; a good one turns it band-success.

### Named Rules
**The Legend Rule.** A thing's hue is the same in the stat strip, its chart, its tag and the activity-mix bar. A page's strip is that page's legend; never assign a hue to a thing that already owns another.

**The Swatch Not Text Rule.** Series hues mark swatches, bars and segments. Words stay in the text ladder.

**The Teal Next To Blue Rule.** Series blue and series teal fail the normal-vision separation floor side by side (ΔE 13.5). Stacked or adjacent marks never put them next to each other. The activity mix stacks sign-ins slate, accounts blue, tickets marigold, travelers teal, system violet, an order that passes.

**The State Is Not A Series Rule.** Success, warning and danger are separate from the six series hues and always arrive with an icon and a word, never colour alone.

**The One Yellow Rule.** Libot yellow with on-yellow text is the one primary action per screen.

## Typography

**Display Font:** Knewave Libot (self-hosted Knewave, one weight mapped across 400 to 900, ascent 98%, descent 24%, line-gap 0)
**Body Font:** Dongle Libot (self-hosted Dongle 400 and 700, with Schibsted Grotesk Variable as fallback)
**Label/Mono Font:** ui-monospace, SF Mono, Menlo, Consolas

**Character:** A brush-lettered display face that shouts the page name and the number that matters, over a soft rounded sans that stays out of the way. Both faces are SIL OFL 1.1, Latin and Latin Extended subsets only.

Dongle's x-height measures 0.30 em against Schibsted Grotesk's 0.53, so the face is scaled with `size-adjust: 172%` and every console font size means what it says. Because the browser multiplies metric overrides by size-adjust, the overrides are written divided by 1.72: ascent 55.8%, descent 15.1%, line-gap 0. Without them every row doubles in height. The console's base body size is 15px.

### Hierarchy
- **Display** (Knewave 400, 36px, 29px under 720px, line-height 1.02): the page title in the band. A count pill in Dongle 700 15px may sit beside it.
- **Numeral** (Knewave 400, 34px, 28px under 720px, line-height 1): stat-strip numbers and the health panel's ping figure.
- **Brand** (Knewave 400, 21px): "Libot Bulacan" in the rail; the avatar initial uses the same face at 14px.
- **Strip Word** (Dongle 700, 25px, line-height 1.05): a word in a stat cell ("Off", "Working", a username).
- **Title** (Dongle 700, 18px): panel titles.
- **Body** (Dongle 400, 15 to 17px): rows, band subtitle (17px), rail links (16px), menu items (16px), jump results (17px), the jump input (19px).
- **Label** (Dongle 700, 13px, 0.05em, uppercase): table column heads and filter-group heads on ink. Rail group labels are 14px 700 in sentence case.
- **Mono** (12.5px, tabular figures; 13px in the band's live line, 11px for key caps): times, dates, IDs, versions, milliseconds, megabytes, uptime.

### Named Rules
**The Knewave Is For Numbers Rule.** Knewave sets page titles, the brand and numerals only. A word in the stat strip is Dongle 700, never Knewave.

**The Measured Things Are Mono Rule.** Times, IDs and measurements are monospace wherever they appear: band live line, activity times, health facts, ticket and log tables, "Signed in 30 min ago".

## Layout

The shell is a sticky 256px ink rail beside a frame holding a sticky 52px ink top bar and the page. Pages run full width (no max-width), padded 16px top and 18px sides, with a 16px gap between sections. Every page opens with the band, then a grid of panels.

Grids: a main column with a 320 to 400px side column (dashboard), a 7:5 even split (System), and a 236px filter column beside the content (Tickets, Accounts). Columns stack with a 16px gap.

Responsive steps:
- **1280px:** side column 340px; filter column 210px.
- **1100px:** side column 320px; a six-cell strip folds to three columns; between 721 and 1100px the rail folds to 68px icons whatever the user chose; the activity row moves who under what.
- **860px:** one column. The dashboard reorders its panels by priority: needs your attention, system health, usage, recent activity, then the rest. Filters stop being sticky.
- **720px:** the rail becomes a drawer (min(300px, 86vw)) behind a backdrop; the top bar shows the page title; page padding 12px; band padding 18px 16px; strips go two across with an odd last cell spanning the row; sparks hide; usage charts go one across; activity rows drop their details.

The rail can fold to 68px icons from the top bar (remembered). Collapsed labels are visually hidden, not removed, so links keep their names for screen readers.

## Elevation & Depth

Flat by default. Depth comes from the two grounds (ink frame against sage paper), white panels with a 1px border, and hairline dividers. Panels, the band, the strip and tables carry no shadow. Only surfaces that open over the page float.

### Shadow Vocabulary
- **Menu** (`box-shadow: 0 10px 28px rgba(6,19,21,0.22), 0 2px 6px rgba(6,19,21,0.10)`): account and theme menus.
- **Dialog** (`box-shadow: 0 18px 48px rgba(6,19,21,0.30), 0 4px 12px rgba(6,19,21,0.12)`): the Ctrl K jump dialog and the profile dialog.
- **Drawer** (`box-shadow: 8px 0 28px rgba(0,0,0,0.28)`): the rail as a phone drawer only.
- **Switch knob** (`box-shadow: 0 1px 2px rgba(0,0,0,0.25)`): the toggle's thumb.

### Named Rules
**The Only Floating Things Float Rule.** No shadow on panels, cards, the band or tables. Menus, dialogs and the phone drawer are the only shadowed surfaces.

## Shapes

Gently rounded rectangles throughout, stepped by size: 14px for the band and panels (12px band on phones), 12px for menus, 10px for buttons and the stat strip, 9px for rail links, icon buttons and the jump field, 8px for menu items, 6px for role chips, 3px for swatches. Counts and state chips are full pills. Avatars are circles. Panel ink heads take a 13px top radius to sit inside the 14px panel. The stat strip is one rounded box whose cells are joined by 1px gaps of shell line, so the dividers are hairlines, not borders on each cell.

## Components

### Buttons
- **Shape:** gently rounded (10px), 36px tall medium, 30px small.
- **Primary:** libot-yellow with on-yellow text, weight 700, 8px 15px. One per screen.
- **Secondary:** white with ink text and a border; the default for neutral actions (Refresh, Clear cache, Check now).
- **Subtle / Success / Warning / Danger:** soft tinted grounds in the brand or status colour (Start maintenance is warning, Take down is danger); Danger Solid for the irreversible.
- **On the band:** secondary and subtle become transparent with shell text and a strong shell-line border; success and warning become outlined in band-success and band-warning.
- **Compact icon actions:** dense account rows use square icon-only buttons, each with an aria-label and title naming the action and the account.

### Chips
- **Role chip:** white, border, text-secondary, 6px radius, Dongle 700 14px, with an icon (town pin, shield).
- **Status pill:** a tone (success, warning, danger, info, neutral) plus icon plus word, full pill.
- **Count badge:** yellow pill with on-yellow, tabular figures, on rail links and the bell.

### Cards / Containers
- **Panel:** white, 1px border, 14px radius, no shadow. Head 11px 16px with a divider; body 14px 16px.
- **Panel heads:** ink head (river-ink, table-head-text) for live lists and tables (Needs your attention, Recent activity, System health, Staff sign-ins); plain white head for forms, charts and notes (Quick actions, Maintenance, Tools, usage charts). Head links are libot-teal 700 on white, shell text on ink.
- **Rows:** divided by hairlines (divider), never boxed as nested cards.

### Inputs / Fields
- **Style:** white, 1px border, 10px radius, 9px 12px padding; placeholder in text-muted at full opacity; caret in libot-teal.
- **Toggle switch:** 46 by 26px pill, slate off, success on, white 20px thumb sliding 20px.
- **Segmented filter tabs:** white box with border; the active tab takes the teal soft tint.
- **Jump input:** borderless 19px with a leading search icon, inside the jump dialog.

### Navigation
- **Rail:** river-ink, 256px. Brand block (36px logo, Knewave name, "Super admin console" in shell-muted), the Jump to page field with a Ctrl K key cap, grouped links (Overview, System, Accounts, Inbox) with 14px 700 group labels in shell-faint, and the account chip at the foot opening a menu (View profile, Change password, Sign out).
- **Links:** 40px tall, 16px Dongle in shell-muted; hover raises to river-ink-raised with shell text; the current page is river-ink-active, weight 700, with its icon in libot-yellow.
- **Top bar:** 52px ink bar with the rail fold button, a system-state pill (green dot, amber when restricted), the bell with a count, and the theme menu.
- **Jump dialog (Ctrl K):** a 560px white dialog 12vh from the top; results show name and hint, the selected one in the teal soft tint; a footer lists the keys.

### Page Band (signature)
The band every super admin page opens with, drawn by PageHeader for the super admin only: river-ink, 14px radius, 22px 24px 20px. Knewave title, an optional subtitle (17px shell-muted, max 820px), an optional live line (Dongle 16px with mono values: refreshed time, database ping, uptime), actions on the right, then the stat strip.

### Stat Strip (signature)
One row of cells, one column per figure (a six-cell strip folds to three on tablets, two on phones). Each cell: a swatch-keyed label (10px swatch in the band step of the thing's hue), a Knewave number or a Dongle 700 word, an optional 74 by 28px column spark of real daily counts in the same hue, and a hint in shell-faint. A warning cell turns its number band-warning and may carry a short flag with an icon; a good cell turns it band-success. Cells may link to the page behind them; the current one is river-ink-active.

### Activity Mix Bar
A 10px bar of segments, one per kind, 2px apart, in MIX_ORDER, with a legend of swatch plus word beneath.

## Do's and Don'ts

### Do:
- **Do** open every super admin page with the band and, where a page has figures, a stat strip whose swatches key that page's charts and tags.
- **Do** give each kind of thing its one series hue everywhere: teal travelers, orange reviews, blue accounts, marigold tickets, violet system, magenta arrivals, slate sign-ins.
- **Do** use the dark (`-dark`) series steps for swatches on the ink band and for marks in the dark theme.
- **Do** set times, IDs and measurements in monospace with tabular figures.
- **Do** give live lists and tables an ink panel head and forms, charts and notes a plain white head.
- **Do** divide rows inside a panel with divider hairlines.
- **Do** pair every status colour with an icon and a word.
- **Do** keep Dongle's size-adjust (172%) and its divided metric overrides whenever the face is loaded.
- **Do** scope every rule under `:root[data-console='superadmin']`, and write no colour in a component; use the tokens.

### Don't:
- **Don't** set a word in Knewave; it is for page titles, the brand and numerals.
- **Don't** put series blue next to series teal in stacked or adjacent marks.
- **Don't** colour text with a series hue, or use a series hue to signal a state.
- **Don't** add a second yellow button to a screen, or use yellow beyond the primary action, count badges, the avatar and the current rail icon.
- **Don't** put shadows on panels, the band or tables; only menus, dialogs and the phone drawer float.
- **Don't** box rows inside a panel as nested cards.
- **Don't** draw a spark from made-up data; sparks show real daily series only.

## The other consoles

The admin and moderator consoles keep the incumbent system in `src/index.css` and `src/theme.jsx`: cream ground (#FBF8F2), Newsreader for page titles, Schibsted Grotesk for text, teal brand (#0A6F78), Libot yellow (#F2CE1B) as the primary action, and their own light and dark blocks. Their header is the plain PageHeader and their frame is `components/Navbar.jsx`. Nothing above applies to them. The super admin world overrides the incumbent tokens only under `:root[data-console='superadmin']`, which SuperShell sets on `<html>` while mounted (and `public/theme-init.js` sets before first paint); tokens it does not override (`--brand`, `--accent`, `--on-accent`, status colours, `--overlay`) are inherited from `index.css`.
