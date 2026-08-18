import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login          from './pages/Login';
import Spots          from './pages/Spots';
import comments       from './pages/comments';
import ModRequests    from './pages/ModRequests';
import myReviewRequests from './pages/myReviewRequests';
import InactiveUsers  from './pages/InactiveUsers';
import Notifications  from './pages/Notifications';
import Navbar         from './components/Navbar';
import { theme as t } from './theme';
import './App.css';

const PrivateRoute = ({ children }) => {
  const token = localStorage.getItem('token');
  return token ? children : <Navigate to="/login" replace />;
};

const ModeratorRoute = ({ children }) => {
  const role = localStorage.getItem('role');
  return role === 'moderator' ? children : <Navigate to="/comments" replace />;
};

const AdminRoute = ({ children }) => {
  const role = localStorage.getItem('role');
  return role === 'admin' ? children : <Navigate to="/my-review-requests" replace />;
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
                    <Route path="/my-review-requests" element={<ModeratorRoute><myReviewRequests /></ModeratorRoute>} />

                    <Route path="/mod-requests"   element={<ModeratorRoute><ModRequests /></ModeratorRoute>} />
                    <Route path="/inactive-users" element={<AdminRoute><InactiveUsers /></AdminRoute>} />
                    <Route path="/notifications"  element={<AdminRoute><Notifications /></AdminRoute>} />

                    <Route path="/spots"     element={<Spots />} />
                    <Route path="/comments"  element={<comments />} />

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
  wrap: { display: 'flex', minHeight: '100vh', background: t.bg },
  main: { flex: 1, overflowY: 'auto', minWidth: 0 },
};