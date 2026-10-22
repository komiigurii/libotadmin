import { useEffect, useState } from 'react';

/*
 * The last answer from /api/auth/admin-session (components/SessionWatcher.jsx
 * asks every 45 s and when the window comes back into view): the bell's unread
 * count and, from Phase 3a, the system's maintenance state. Kept here so the
 * rail, the banner and the pages read one copy instead of each asking.
 */

let last = null;
const subscribers = new Set();

export const getHeartbeat = () => last;

/** Merges `part` into the last answer and tells every listener. */
export function publishHeartbeat(part) {
  last = { ...(last || {}), ...part };
  subscribers.forEach((fn) => fn(last));
}

export function useHeartbeat() {
  const [value, setValue] = useState(last);
  useEffect(() => {
    subscribers.add(setValue);
    setValue(last);
    return () => { subscribers.delete(setValue); };
  }, []);
  return value;
}
