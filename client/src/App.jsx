import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import HostDashboard from './pages/HostDashboard'
import GameManagement from './pages/GameManagement'
import PublicDisplay from './pages/PublicDisplay'
import Login from './pages/Login'
import { initGA, trackPageView } from './utils/analytics'

// Component to track page views on route changes
function PageViewTracker() {
  const location = useLocation();

  useEffect(() => {
    trackPageView(location.pathname + location.search);
  }, [location]);

  return null;
}

function App() {
  useEffect(() => {
    // Initialize Google Analytics on app mount
    initGA();
  }, []);

  return (
    <AuthProvider>
      <BrowserRouter>
        <PageViewTracker />
        <Routes>
          {/* Public routes */}
          <Route path="/display/:id" element={<PublicDisplay />} />
          
          {/* Authentication */}
          <Route path="/login" element={<Login />} />
          
          {/* Protected host routes */}
          <Route 
            path="/" 
            element={
              <ProtectedRoute>
                <HostDashboard />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/host" 
            element={
              <ProtectedRoute>
                <HostDashboard />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/host/game/:id" 
            element={
              <ProtectedRoute>
                <GameManagement />
              </ProtectedRoute>
            } 
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
