import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login          from './pages/Login';
import Dashboard      from './pages/Dashboard';
import Spots          from './pages/Spots';
import Comments       from './pages/Comments';
import ModRequests    from './pages/ModRequests';
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
  return role === 'admin' ? children : <Navigate to="/dashboard" replace />;
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
                    <Route path="/dashboard" element={<ModeratorRoute><Dashboard /></ModeratorRoute>} />

                    <Route path="/mod-requests"   element={<AdminRoute><ModRequests /></AdminRoute>} />
                    <Route path="/inactive-users" element={<AdminRoute><InactiveUsers /></AdminRoute>} />
                    <Route path="/notifications"  element={<AdminRoute><Notifications /></AdminRoute>} />

                    <Route path="/spots"     element={<Spots />} />
                    <Route path="/comments"  element={<Comments />} />

                    <Route
                      path="*"
                      element={
                        <Navigate
                          to={localStorage.getItem('role') === 'admin' ? '/comments' : '/dashboard'}
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