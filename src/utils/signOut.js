import { useEffect, useState } from 'react';

/*
 * The countdown to a sign-out by maintenance or a paused role, shared by the
 * pop-up (components/SignOutPopup.jsx), the strip above the page
 * (components/MaintenanceBanner.jsx) and the System page.
 */

/** Milliseconds left until `at` (ms since epoch), ticking each second; null without one. */
export function useCountdown(at) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!at) return undefined;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 1000);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, [at]);
  return at ? Math.max(0, at - now) : null;
}

/** 102 500 ms → "1:43". */
export function clockText(ms) {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// What each kind says, by the server's code.
export const SIGN_OUT_TEXT = {
  maintenance: { icon: 'tool', title: 'Maintenance is starting', lead: 'The super admin is putting the console under maintenance.' },
  restricted:  { icon: 'pause', title: 'Your access is being paused', lead: 'The super admin is pausing the console for your role.' },
};
