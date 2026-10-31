import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
// Login + the console's frame stay eager: they're the first paint for every
// session, so code-splitting them would only buy a spinner. Every
// authenticated page is lazy — notably Spots, which pulls in Leaflet (by far
// the heaviest dependency here) and was previously downloaded even by
// moderators sitting on the login screen.
import Login  from './pages/Login';
import ConsoleShell from './components/ConsoleShell';
// Eager too: the console's frame holds the change-password pop-up, which is
// built from the same file.
import { SetPassword } from './pages/ChangePassword';
const Dashboard        = lazy(() => import('./pages/Dashboard'));
const ModeratorSpotManagement = lazy(() => import('./pages/SpotManagement').then((m) => ({ default: m.ModeratorSpotManagement })));
const SpotManagement   = lazy(() => import('./pages/SpotManagement'));
const Comments         = lazy(() => import('./pages/Comments'));
const MyReviewRequests = lazy(() => import('./pages/MyReviewRequests'));
const UserManagement   = lazy(() => import('./pages/UserManagement'));
const Moderators       = lazy(() => import('./pages/Moderators'));
const MyTravelers      = lazy(() => import('./pages/MyTravelers'));
const TownBadges      = lazy(() => import('./pages/TownBadges'));
const Accounts         = lazy(() => import('./pages/Accounts'));
const ActivityLog      = lazy(() => import('./pages/ActivityLog'));
const Notifications    = lazy(() => import('./pages/Notifications'));
const Tickets          = lazy(() => import('./pages/Tickets'));
const TicketDetail     = lazy(() => import('./pages/Tickets').then((m) => ({ default: m.TicketDetail })));
const System           = lazy(() => import('./pages/System'));
import SessionWatcher from './components/SessionWatcher';
import MaintenanceBanner from './components/MaintenanceBanner';
import { AppAlertProvider } from './components/AppAlert';
import { Page, Loading } from './components/Layout';
import { theme as t } from './theme';
import { hasValidSession, getToken, clearSession, mustChangePassword } from './auth/session';
import { isAdminOnly, isModeratorRole, isSuperAdmin } from './auth/roles';
import './App.css';

// While a page's code downloads: the outline of a page, in the console.
function PageFallback() {
  return <Page><Loading label="Opening the page…" kind="page" /></Page>;
}

// Set password has no console around it, so no band to sketch.
function PlainFallback() {
  return <div style={shell.fallback}>Loading…</div>;
}

/* Any valid session passes this gate. Role checks happen in the role guards below. */
const SignedIn = ({ children }) => {
  if (hasValidSession()) return children;
  // A stored-but-expired token gets the "session expired" note on sign-in.
  const reason = getToken() ? '?reason=expired' : '';
  clearSession();
  return <Navigate to={`/login${reason}`} replace />;
};

// An account still on the temporary password from its credential slip goes to
// /set-password first; the server refuses everything else until it's done.
const PrivateRoute = ({ children }) => (
  <SignedIn>{mustChangePassword() ? <Navigate to="/set-password" replace /> : children}</SignedIn>
);

// Both guards send the other role to the dashboard — the one page every role
// has. AdminRoute used to redirect to /mod-requests, which is itself
// admin-only, so a moderator opening any admin URL bounced between the guard
// and its own redirect target.
const ModeratorRoute = ({ children }) => (
  isModeratorRole() ? children : <Navigate to="/dashboard" replace />
);

// Admins only. The super admin's console holds only the super admin's own
// pages (the user, 2026-10-22), so it is turned away here too.
const AdminRoute = ({ children }) => (
  isAdminOnly() ? children : <Navigate to="/dashboard" replace />
);

// /spots: an admin's Spot Management (the spots and the Approval Queue), or a
// moderator's (their municipality's spots and their requests waiting for
// approval). A component, so the role is read on every visit.
const SpotsRoute = () => (
  isAdminOnly() ? <SpotManagement /> : isModeratorRole() ? <ModeratorSpotManagement /> : <Navigate to="/dashboard" replace />
);

// Only while there is a temporary password to replace. A component, so the
// check runs on every visit: an expression in App's JSX is read once, when the
// page first loads (before sign-in), and bounced between here and /dashboard.
const SetPasswordRoute = () => (
  mustChangePassword() ? <SetPassword /> : <Navigate to="/dashboard" replace />
);

// Accounts, the activity log and the System page: the super admin's alone.
const SuperAdminRoute = ({ children }) => (
  isSuperAdmin() ? children : <Navigate to="/dashboard" replace />
);

// The frame around every signed-in page, for every role
// (components/ConsoleShell.jsx: dark rail, top bar, page bands; each role
// keeps its own links). A component, so the role is read when the frame
// mounts after sign-in, not when the app first loaded.
function Console({ children }) {
  return (
    <ConsoleShell>
      <SessionWatcher />
      {/* id + tabIndex give the shell's skip link somewhere to land. */}
      <main id="main" tabIndex={-1} className="sa-main">{children}</main>
    </ConsoleShell>
  );
}

export default function App() {
  return (
    <AppAlertProvider>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/set-password"
          element={
            <SignedIn>
              <SessionWatcher />
              <Suspense fallback={<PlainFallback />}>
                <SetPasswordRoute />
              </Suspense>
            </SignedIn>
          }
        />

        <Route
          path="/*"
          element={
            <PrivateRoute>
              <Console>
                  <MaintenanceBanner />
                  <Suspense fallback={<PageFallback />}>
                    <Routes>
                      {/* Both roles; the page itself is role-aware. */}
                      <Route path="/dashboard"          element={<Dashboard />} />

                      <Route path="/my-review-requests" element={<ModeratorRoute><MyReviewRequests /></ModeratorRoute>} />
                      {/* Read-only: the travelers who visited the moderator's municipality's spots. */}
                      <Route path="/my-travelers"       element={<ModeratorRoute><MyTravelers /></ModeratorRoute>} />

                      {/* Old addresses: the Approval Queue is a tab of Spot
                          Management, and travelers no longer report reviews
                          (a review with a bad word is blocked instead). */}
                      <Route path="/mod-requests"       element={<Navigate to="/spots/approvals" replace />} />
                      <Route path="/reported-comments"  element={<Navigate to="/comments" replace />} />
                      {/* Traveler Progress, Suspensions & Bans and Inactive
                          Accounts are tabs of User Management now; older links
                          (and notifications) still point at their own pages. */}
                      <Route path="/user-progress"      element={<Navigate to="/user-management?tab=progress" replace />} />
                      <Route path="/banned-accounts"    element={<Navigate to="/user-management?tab=bans" replace />} />
                      <Route path="/inactive-users"     element={<Navigate to="/user-management?tab=inactive" replace />} />
                      {/* Admin-only, like the backend: moderators work only on
                          attractions and their own requests. */}
                      <Route path="/user-management"     element={<AdminRoute><UserManagement /></AdminRoute>} />
                      <Route path="/comments"           element={<AdminRoute><Comments /></AdminRoute>} />
                      <Route path="/moderators"         element={<AdminRoute><Moderators /></AdminRoute>} />
                      <Route path="/town-badges"        element={<AdminRoute><TownBadges /></AdminRoute>} />

                      <Route path="/accounts"           element={<SuperAdminRoute><Accounts /></SuperAdminRoute>} />
                      <Route path="/activity"           element={<SuperAdminRoute><ActivityLog /></SuperAdminRoute>} />
                      <Route path="/system"             element={<SuperAdminRoute><System /></SuperAdminRoute>} />
                      {/* The System Console's first address (a teammate's build, 2026-10-22). */}
                      <Route path="/superadmin"         element={<Navigate to="/system" replace />} />

                      {/* Every role, any time. Tickets: the super admin's queue,
                          or an admin's / moderator's own (Report a Problem). */}
                      {/* Change password is a pop-up (ConsoleShell); its old
                          address opens it over the dashboard. */}
                      <Route path="/change-password"    element={<Navigate to="/dashboard" replace state={{ changePassword: true }} />} />
                      <Route path="/notifications"      element={<Notifications />} />
                      <Route path="/tickets"            element={<Tickets />} />
                      <Route path="/tickets/:id"        element={<TicketDetail />} />

                      {/* An admin's Spot Management (the spots, and the
                          Approval Queue tab); a moderator's (their spots, and
                          the Waiting for approval tab). */}
                      <Route path="/spots"            element={<SpotsRoute />} />
                      <Route path="/spots/approvals"  element={<AdminRoute><SpotManagement /></AdminRoute>} />
                      <Route path="/spots/waiting"    element={<ModeratorRoute><ModeratorSpotManagement /></ModeratorRoute>} />

                      <Route path="*" element={<Navigate to="/dashboard" replace />} />
                    </Routes>
                  </Suspense>
              </Console>
            </PrivateRoute>
          }
        />
      </Routes>
    </BrowserRouter>
    </AppAlertProvider>
  );
}

const shell = {
  fallback: { padding: 48, textAlign: 'center', color: t.textMuted, fontSize: 15 },
};