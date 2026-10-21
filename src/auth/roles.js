/*
 * Panel roles, mirroring the backend (middleware/adminAuth.js):
 *   superadmin — the development team: everything an admin can do, plus
 *                accounts, maintenance and the system tools;
 *   admin      — approves moderators' work, manages travelers;
 *   moderator  — one municipality's spots and their own requests.
 */

export const getRole = () => localStorage.getItem('role') || '';

export const isSuperAdmin = (role = getRole()) => role === 'superadmin';
export const isAdminRole = (role = getRole()) => role === 'admin' || role === 'superadmin';
export const isModeratorRole = (role = getRole()) => role === 'moderator';

/** "Super Admin", "Admin" or "Moderator", for titles and the rail. */
export function roleLabel(role = getRole()) {
  if (role === 'superadmin') return 'Super Admin';
  if (role === 'moderator') return 'Moderator';
  return 'Admin';
}
