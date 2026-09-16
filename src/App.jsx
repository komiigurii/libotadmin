import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
// Login + Navbar stay eager: they're the first paint for every session, so
// code-splitting them would only buy a spinner. Every authenticated page is
// lazy — notably Spots, which pulls in Leaflet (by far the heaviest
// dependency here) and was previously downloaded even by moderators sitting
// on the login screen.
import Login  from './pages/Login';
import Navbar from './components/Navbar';
const Spots            = lazy(() => import('./pages/Spots'));
const Comments         = lazy(() => import('./pages/Comments'));
const ReportedComments = lazy(() => import('./pages/ReportedComments'));
const ModRequests      = lazy(() => import('./pages/ModRequests'));
const MyReviewRequests = lazy(() => import('./pages/MyReviewRequests'));
const InactiveUsers    = lazy(() => import('./pages/InactiveUsers'));
const BannedAccounts   = lazy(() => import('./pages/BannedAccounts'));
import { AppAlertProvider } from './components/AppAlert';
import { theme as t } from './theme';
import './App.css';

function PageFallback() {
  return <div style={shell.fallback}>Loading…</div>;
}

const PrivateRoute = ({ children }) => {
  const token = localStorage.getItem('token');
  return token ? children : <Navigate to="/login" replace />;
};

const ModeratorRoute = ({ children }) => {
  const role = localStorage.getItem('role');
  return role === 'moderator' ? children : <Navigate to="/spots" replace />;
};

const AdminRoute = ({ children }) => {
  const role = localStorage.getItem('role');
  return role === 'admin' ? children : <Navigate to="/mod-requests" replace />;
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
              <div style={shell.wrap}>
                <Navbar />
                <main style={shell.main}>
                  <Suspense fallback={<PageFallback />}>
                    <Routes>
                      <Route path="/my-review-requests" element={<ModeratorRoute><MyReviewRequests /></ModeratorRoute>} />

                      <Route path="/mod-requests"       element={<AdminRoute><ModRequests /></AdminRoute>} />
                      <Route path="/reported-comments"  element={<AdminRoute><ReportedComments /></AdminRoute>} />
                      <Route path="/inactive-users"     element={<AdminRoute><InactiveUsers /></AdminRoute>} />
                      <Route path="/banned-accounts"    element={<AdminRoute><BannedAccounts /></AdminRoute>} />

                      <Route path="/spots"     element={<Spots />} />
                      <Route path="/comments"  element={<Comments />} />

                      <Route
                        path="*"
                        element={
                          <Navigate
                            to={localStorage.getItem('role') === 'admin' ? '/comments' : '/my-review-requests'}
                            replace
                          />
                        }
                      />
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