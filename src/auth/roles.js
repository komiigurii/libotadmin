/*
 * Panel roles:
 *   superadmin — the development team: the system (maintenance, the tools,
 *                update notices), every account, the staff's tickets and the
 *                activity log. Its console holds only those (the user,
 *                2026-10-22: "superadmin panel should only contain superadmin
 *                functions"), not the admins' spots, reviews or travelers;
 *   admin      — spots (added, edited and deleted directly, and the
 *                moderators' requests), reviews, travelers, moderators;
 *   moderator  — one municipality's spots and their own requests.
 */

export const getRole = () => localStorage.getItem('role') || '';

export const isSuperAdmin = (role = getRole()) => role === 'superadmin';
export const isAdminOnly = (role = getRole()) => role === 'admin';
export const isModeratorRole = (role = getRole()) => role === 'moderator';

/** "Super Admin", "Admin" or "Moderator", for titles and the rail. */
export function roleLabel(role = getRole()) {
  if (role === 'superadmin') return 'Super Admin';
  if (role === 'moderator') return 'Moderator';
  return 'Admin';
}
