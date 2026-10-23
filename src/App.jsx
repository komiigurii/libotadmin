import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
// Login + Navbar stay eager: they're the first paint for every session, so
// code-splitting them would only buy a spinner. Every authenticated page is
// lazy — notably Spots, which pulls in Leaflet (by far the heaviest
// dependency here) and was previously downloaded even by moderators sitting
// on the login screen.
import Login  from './pages/Login';
import Navbar from './components/Navbar';
import SuperShell from './components/SuperShell';
const Dashboard        = lazy(() => import('./pages/Dashboard'));
const Spots            = lazy(() => import('./pages/Spots'));
const SpotManagement   = lazy(() => import('./pages/SpotManagement'));
const Comments         = lazy(() => import('./pages/Comments'));
const MyReviewRequests = lazy(() => import('./pages/MyReviewRequests'));
const InactiveUsers    = lazy(() => import('./pages/InactiveUsers'));
const BannedAccounts   = lazy(() => import('./pages/BannedAccounts'));
const UserProgress     = lazy(() => import('./pages/UserProgress'));
const Moderators       = lazy(() => import('./pages/Moderators'));
const MyTravelers      = lazy(() => import('./pages/MyTravelers'));
const TownBadges      = lazy(() => import('./pages/TownBadges'));
const Accounts         = lazy(() => import('./pages/Accounts'));
const ActivityLog      = lazy(() => import('./pages/ActivityLog'));
const ChangePassword   = lazy(() => import('./pages/ChangePassword'));
const SetPassword      = lazy(() => import('./pages/ChangePassword').then((m) => ({ default: m.SetPassword })));
const Notifications    = lazy(() => import('./pages/Notifications'));
const Tickets          = lazy(() => import('./pages/Tickets'));
const TicketDetail     = lazy(() => import('./pages/Tickets').then((m) => ({ default: m.TicketDetail })));
const System           = lazy(() => import('./pages/System'));
import SessionWatcher from './components/SessionWatcher';
import MaintenanceBanner from './components/MaintenanceBanner';
import { AppAlertProvider } from './components/AppAlert';
import { theme as t } from './theme';
import { hasValidSession, getToken, clearSession, mustChangePassword } from './auth/session';
import { isAdminOnly, isModeratorRole, isSuperAdmin } from './auth/roles';
import './App.css';

function PageFallback() {
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
// moderator's own town's spots. A component, so the role is read on every visit.
const SpotsRoute = () => (
  isAdminOnly() ? <SpotManagement /> : isModeratorRole() ? <Spots /> : <Navigate to="/dashboard" replace />
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

// The frame around every signed-in page. The super admin's console has its
// own (components/SuperShell.jsx: dark rail, top bar, page bands);
// admins and moderators keep the cream rail. A component, so the role is read
// when the frame mounts after sign-in, not when the app first loaded.
function ConsoleShell({ children }) {
  if (isSuperAdmin()) {
    return (
      <SuperShell>
        <SessionWatcher />
        <main id="main" tabIndex={-1} className="sa-main">{children}</main>
      </SuperShell>
    );
  }
  return (
    <div className="admin-shell" style={shell.wrap}>
      {/* First focusable element on the page. Without it a keyboard user tabs
          through the entire sidebar on every page load before reaching the
          table they came for. */}
      <a href="#main" className="skip-link">Skip to content</a>
      <Navbar />
      <SessionWatcher />
      {/* id + tabIndex give the skip link somewhere to land. */}
      <main id="main" tabIndex={-1} style={shell.main}>{children}</main>
    </div>
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
              <Suspense fallback={<PageFallback />}>
                <SetPasswordRoute />
              </Suspense>
            </SignedIn>
          }
        />

        <Route
          path="/*"
          element={
            <PrivateRoute>
              <ConsoleShell>
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
                          (the automatic filter masks bad words instead). */}
                      <Route path="/mod-requests"       element={<Navigate to="/spots/approvals" replace />} />
                      <Route path="/reported-comments"  element={<Navigate to="/comments" replace />} />
                      {/* Admin-only, like the backend: moderators work only on
                          attractions and their own requests. */}
                      <Route path="/inactive-users"     element={<AdminRoute><InactiveUsers /></AdminRoute>} />
                      <Route path="/banned-accounts"    element={<AdminRoute><BannedAccounts /></AdminRoute>} />
                      <Route path="/comments"           element={<AdminRoute><Comments /></AdminRoute>} />
                      <Route path="/user-progress"      element={<AdminRoute><UserProgress /></AdminRoute>} />
                      <Route path="/moderators"         element={<AdminRoute><Moderators /></AdminRoute>} />
                      <Route path="/town-badges"        element={<AdminRoute><TownBadges /></AdminRoute>} />

                      <Route path="/accounts"           element={<SuperAdminRoute><Accounts /></SuperAdminRoute>} />
                      <Route path="/activity"           element={<SuperAdminRoute><ActivityLog /></SuperAdminRoute>} />
                      <Route path="/system"             element={<SuperAdminRoute><System /></SuperAdminRoute>} />
                      {/* The System Console's first address (a teammate's build, 2026-10-22). */}
                      <Route path="/superadmin"         element={<Navigate to="/system" replace />} />

                      {/* Every role, any time. Tickets: the super admin's queue,
                          or an admin's / moderator's own (Report a Problem). */}
                      <Route path="/change-password"    element={<ChangePassword />} />
                      <Route path="/notifications"      element={<Notifications />} />
                      <Route path="/tickets"            element={<Tickets />} />
                      <Route path="/tickets/:id"        element={<TicketDetail />} />

                      {/* An admin's Spot Management (the spots, and the
                          Approval Queue tab); a moderator's town's spots. */}
                      <Route path="/spots"            element={<SpotsRoute />} />
                      <Route path="/spots/approvals"  element={<AdminRoute><SpotManagement /></AdminRoute>} />

                      <Route path="*" element={<Navigate to="/dashboard" replace />} />
                    </Routes>
                  </Suspense>
              </ConsoleShell>
            </PrivateRoute>
          }
        />
      </Routes>
    </BrowserRouter>
    </AppAlertProvider>
  );
}

const shell = {
  // A flat page: the teal haze that used to sit in the top corner was one more
  // thing in the eye line of every screen (2026-10-21, "quieter").
  wrap: { display: 'flex', minHeight: '100vh', background: t.bg },
  main: { flex: 1, overflowY: 'auto', minWidth: 0 },
};