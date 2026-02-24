import { Navigate, Route, Routes } from 'react-router-dom';
import Navbar from './components/Navbar';
import ProcessPage from './pages/ProcessPage';
import UploadPage from './pages/UploadPage';
import WatchPage from './pages/WatchPage';

function App() {
  return (
    <div className="min-h-screen bg-bg-primary">
      <Navbar />
      <Routes>
        <Route path="/" element={<UploadPage />} />
        <Route path="/process/:id" element={<ProcessPage />} />
        <Route path="/watch/:id" element={<WatchPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

export default App;
