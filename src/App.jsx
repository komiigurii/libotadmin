import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login          from './pages/Login';
import Spots          from './pages/Spots';
import Comments       from './pages/Comments';
import ReportedComments from './pages/ReportedComments';
import ModRequests    from './pages/ModRequests';
import MyReviewRequests from './pages/MyReviewRequests';
import InactiveUsers  from './pages/InactiveUsers';
import Navbar         from './components/Navbar';
import BannedAccounts from './pages/BannedAccounts';
import { theme as t } from './theme';
import './App.css';

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
                  <Routes>
                    <Route path="/my-review-requests" element={<ModeratorRoute><MyReviewRequests /></ModeratorRoute>} />

                    <Route path="/mod-requests"       element={<AdminRoute><ModRequests /></AdminRoute>} />
                    <Route path="/reported-comments"  element={<AdminRoute><ReportedComments /></AdminRoute>} />
                    <Route path="/inactive-users"     element={<AdminRoute><InactiveUsers /></AdminRoute>} />
                    <Route path="/banned-accounts"    element={<AdminRoute><BannedAccounts /></AdminRoute>} />

                    <Route path="/spots"     element={<Spots />} />
                    <Route path="/Comments"  element={<Comments />} />

                    <Route
                      path="*"
                      element={
                        <Navigate
                          to={localStorage.getItem('role') === 'admin' ? '/Comments' : '/my-review-requests'}
                          replace
                        />
                      }
                    />
                  </Routes>
                </main>
              </div>
            </PrivateRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

const shell = {
  wrap: {
    display: 'flex', minHeight: '100vh',
    background: `radial-gradient(1200px 600px at 100% 0%, ${t.brandSoft}, transparent 60%), ${t.bg}`,
  },
  main: { flex: 1, overflowY: 'auto', minWidth: 0 },
};