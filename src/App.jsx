import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Spots from './pages/Spots';
import Reports from './pages/Reports';
import Navbar from './components/Navbar';

const PrivateRoute = ({ children }) => {
  const token = localStorage.getItem('token');
  return token ? children : <Navigate to="/login" />;
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
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/spots"     element={<Spots />} />
              <Route path="/reports"   element={<Reports />} />
              <Route path="*"          element={<Navigate to="/dashboard" />} />
            </Routes>
          </PrivateRoute>
        } />
      </Routes>
    </BrowserRouter>
  );
}