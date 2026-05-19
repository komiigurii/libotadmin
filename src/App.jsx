import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login          from './pages/Login';
import Dashboard      from './pages/Dashboard';
import Spots          from './pages/Spots';
import Reports        from './pages/Reports';
import PendingChanges from './pages/PendingChanges';
import Navbar         from './components/Navbar';

const PrivateRoute = ({ children }) => {
  const token = localStorage.getItem('token');
  return token ? children : <Navigate to="/login" />;
};

const AdminRoute = ({ children }) => {
  const role = localStorage.getItem('role');
  return role === 'admin' ? children : <Navigate to="/pending" />;
};

const ModeratorRoute = ({ children }) => {
  const role = localStorage.getItem('role');
  return role === 'moderator' ? children : <Navigate to="/dashboard" />;
};

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/*" element={
          <PrivateRoute>
            <Navbar />
            <Routes>
              <Route path="/dashboard" element={<AdminRoute><Dashboard /></AdminRoute>} />
              <Route path="/spots"     element={<AdminRoute><Spots /></AdminRoute>} />
              <Route path="/reports"   element={<AdminRoute><Reports /></AdminRoute>} />
              <Route path="/pending"   element={<ModeratorRoute><PendingChanges /></ModeratorRoute>} />
              <Route path="*" element={
                <Navigate to={localStorage.getItem('role') === 'moderator' ? '/pending' : '/dashboard'} />
              } />
            </Routes>
          </PrivateRoute>
        } />
      </Routes>
    </BrowserRouter>
  );
}