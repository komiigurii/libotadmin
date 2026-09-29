# Libot Admin

The web panel where admins and moderators manage Libot's spots, missions,
reviews, reports and accounts. React 19 + Vite, deployed on Vercel, talking to
the LibotBackend API.

## Run it locally

```bash
npm install
npm run dev        # http://localhost:5173
```

`VITE_API_URL` in `.env` sets which backend the panel uses (production by
default). It is compiled into the public JavaScript, so it must never hold a
secret.

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Production build into `dist/` |
| `npm test` | Unit tests (Vitest) |
| `npm run lint` | ESLint |

## Sessions

Signing in stores the admin token (valid 12 hours) with the role and city.
`src/auth/session.js` ends the session and returns to sign-in with "Your session
expired" when the token lapses or the API answers 401 — for example after
`JWT_SECRET` is rotated on the backend.

## Deploying (Vercel)

Pushing to `main` deploys. `vercel.json` sets:

- a rewrite so deep links such as `/spots` load the app instead of a 404;
- security headers, including a **Content-Security-Policy** that only allows
  scripts from this site and network calls to the API and OpenStreetMap's
  address search.

**If you add a new external service** (another API, a font or script CDN), add
its origin to the matching directive in `vercel.json` — `connect-src` for
fetch/XHR, `script-src` for scripts, `font-src` for fonts — or the browser will
block it. Images from any `https:` source are already allowed. Blocked requests
show in the browser console as "Refused to … because it violates the Content
Security Policy".
