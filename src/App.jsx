import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
// Login + Navbar stay eager: they're the first paint for every session, so
// code-splitting them would only buy a spinner. Every authenticated page is
// lazy — notably Spots, which pulls in Leaflet (by far the heaviest
// dependency here) and was previously downloaded even by moderators sitting
// on the login screen.
import Login  from './pages/Login';
import Navbar from './components/Navbar';
const Dashboard        = lazy(() => import('./pages/Dashboard'));
const Spots            = lazy(() => import('./pages/Spots'));
const Comments         = lazy(() => import('./pages/Comments'));
const ReportedComments = lazy(() => import('./pages/ReportedComments'));
const ModRequests      = lazy(() => import('./pages/ModRequests'));
const MyReviewRequests = lazy(() => import('./pages/MyReviewRequests'));
const InactiveUsers    = lazy(() => import('./pages/InactiveUsers'));
const BannedAccounts   = lazy(() => import('./pages/BannedAccounts'));
const UserProgress     = lazy(() => import('./pages/UserProgress'));
import { AppAlertProvider } from './components/AppAlert';
import { theme as t } from './theme';
import { hasValidSession, getToken, clearSession } from './auth/session';
import './App.css';

function PageFallback() {
  return <div style={shell.fallback}>Loading…</div>;
}

const PrivateRoute = ({ children }) => {
  if (hasValidSession()) return children;
  // A stored-but-expired token gets the "session expired" note on sign-in.
  const reason = getToken() ? '?reason=expired' : '';
  clearSession();
  return <Navigate to={`/login${reason}`} replace />;
};

// Both guards send the other role to the dashboard — the one page every role
// has. AdminRoute used to redirect to /mod-requests, which is itself
// admin-only, so a moderator opening any admin URL bounced between the guard
// and its own redirect target.
const ModeratorRoute = ({ children }) => {
  const role = localStorage.getItem('role');
  return role === 'moderator' ? children : <Navigate to="/dashboard" replace />;
};

const AdminRoute = ({ children }) => {
  const role = localStorage.getItem('role');
  return role === 'admin' ? children : <Navigate to="/dashboard" replace />;
};

export default function App() {
  return (
    <AppAlertProvider>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route
          path="/*"
          element={
            <PrivateRoute>
              <div className="admin-shell" style={shell.wrap}>
                {/* First focusable element on the page. Without it a keyboard
                    user tabs through the entire sidebar on every page load
                    before reaching the table they came for. */}
                <a href="#main" className="skip-link">Skip to content</a>
                <Navbar />
                {/* id + tabIndex give the skip link below somewhere to land. */}
                <main id="main" tabIndex={-1} style={shell.main}>
                  <Suspense fallback={<PageFallback />}>
                    <Routes>
                      {/* Both roles; the page itself is role-aware. */}
                      <Route path="/dashboard"          element={<Dashboard />} />

                      <Route path="/my-review-requests" element={<ModeratorRoute><MyReviewRequests /></ModeratorRoute>} />

                      <Route path="/mod-requests"       element={<AdminRoute><ModRequests /></AdminRoute>} />
                      <Route path="/reported-comments"  element={<AdminRoute><ReportedComments /></AdminRoute>} />
                      {/* Admin-only, like the backend: moderators work only on
                          attractions and their own requests. */}
                      <Route path="/inactive-users"     element={<AdminRoute><InactiveUsers /></AdminRoute>} />
                      <Route path="/banned-accounts"    element={<AdminRoute><BannedAccounts /></AdminRoute>} />
                      <Route path="/comments"           element={<AdminRoute><Comments /></AdminRoute>} />
                      <Route path="/user-progress"      element={<AdminRoute><UserProgress /></AdminRoute>} />

                      {/* Both roles: moderators manage their municipality's
                          attractions; admins see every one, read-only. */}
                      <Route path="/spots"     element={<Spots />} />

                      <Route path="*" element={<Navigate to="/dashboard" replace />} />
                    </Routes>
                  </Suspense>
                </main>
              </div>
            </PrivateRoute>
          }
        />
      </Routes>
    </BrowserRouter>
    </AppAlertProvider>
  );
}

const shell = {
  wrap: {
    display: 'flex', minHeight: '100vh',
    background: `radial-gradient(1200px 600px at 100% 0%, ${t.brandSoft}, transparent 60%), ${t.bg}`,
  },
  main: { flex: 1, overflowY: 'auto', minWidth: 0 },
};