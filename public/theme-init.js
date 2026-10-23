/*
 * Applies the saved theme BEFORE first paint. Without this, someone who picked
 * dark gets a flash of the light page while the bundle loads and React mounts.
 * Loaded as a plain blocking <script> in <head> (see index.html), so it runs
 * synchronously. "system" writes no attribute, which lets the
 * prefers-color-scheme query in index.css take over.
 *
 * It lives in its own file rather than inline so the Content-Security-Policy in
 * vercel.json can forbid inline scripts outright (`script-src 'self'`).
 */
(function () {
  try {
    var p = localStorage.getItem('libot_admin_theme');
    if (p === 'light' || p === 'dark') {
      document.documentElement.setAttribute('data-theme', p);
    }
    // The consoles' look (src/console.css) hangs off data-console. Set here
    // too so a reload doesn't flash the sign-in pages' look first;
    // components/ConsoleShell.jsx keeps it in step after that. Not on the
    // sign-in pages themselves, which have no console around them.
    var path = window.location.pathname;
    var role = localStorage.getItem('role');
    if ((role === 'superadmin' || role === 'admin' || role === 'moderator') && path !== '/login' && path !== '/set-password') {
      document.documentElement.setAttribute('data-console', role);
    }
  } catch { /* private mode — fall back to the OS preference */ }
})();
