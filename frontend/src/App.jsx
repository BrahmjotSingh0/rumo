import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { I18nProvider } from './i18n/I18nProvider';
import branding from './config/branding';
import Home from './components/Home';
import PreJoin from './components/PreJoin';
import MeetingPro from './components/MeetingPro';
import Admin from './components/Admin';
import './index.css';

function App() {
  useEffect(() => {
    document.title = branding.appName;
  }, []);

  return (
    <I18nProvider>
      <Router>
        <div className="min-h-screen bg-gray-900">
          <Routes>
            <Route path="/" element={<Home />} />
            {/* Main entry point - PreJoin page */}
            <Route path="/room/:roomId" element={<PreJoin />} />
            {/* Meeting links redirect to PreJoin - users must go through PreJoin */}
            <Route path="/meeting/:roomId" element={<PreJoin />} />
            {/* Internal meeting room - only accessible from PreJoin navigation */}
            <Route path="/m/:roomId" element={<MeetingPro />} />
            <Route path="/admin" element={<Admin />} />
          </Routes>

          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              className: 'bg-gray-800 text-white border border-gray-700',
              success: {
                className: 'toast-success',
              },
              error: {
                className: 'toast-error',
              },
            }}
          />
        </div>
      </Router>
    </I18nProvider>
  );
}

export default App;