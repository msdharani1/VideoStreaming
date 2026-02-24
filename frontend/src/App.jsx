import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import ScrollToTop from './components/ScrollToTop';
import { useAuth } from './context/AuthContext';
import HelpPage from './pages/HelpPage';
import LoginPage from './pages/LoginPage';
import ProcessPage from './pages/ProcessPage';
import UploadPage from './pages/UploadPage';
import VideosPage from './pages/VideosPage';
import WatchPage from './pages/WatchPage';

function RequireAuth({ children }) {
  const location = useLocation();
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return children;
}

function RequireAdmin({ children }) {
  const { isAdmin } = useAuth();
  if (!isAdmin) {
    return <Navigate to="/videos" replace />;
  }
  return children;
}

function App() {
  const { isAuthenticated, isAdmin } = useAuth();

  return (
    <div className="min-h-screen bg-bg-primary">
      <ScrollToTop />
      <Navbar />
      <Routes>
        <Route
          path="/"
          element={<Navigate to={isAuthenticated ? (isAdmin ? '/admin' : '/videos') : '/login'} replace />}
        />
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/videos"
          element={
            <RequireAuth>
              <VideosPage />
            </RequireAuth>
          }
        />
        <Route
          path="/admin"
          element={
            <RequireAuth>
              <RequireAdmin>
                <UploadPage />
              </RequireAdmin>
            </RequireAuth>
          }
        />
        <Route
          path="/process/:id"
          element={
            <RequireAuth>
              <RequireAdmin>
                <ProcessPage />
              </RequireAdmin>
            </RequireAuth>
          }
        />
        <Route
          path="/watch/:id"
          element={
            <RequireAuth>
              <WatchPage />
            </RequireAuth>
          }
        />
        <Route
          path="/help"
          element={
            <RequireAuth>
              <HelpPage />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

export default App;
