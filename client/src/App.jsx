import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import HostDashboard from './pages/HostDashboard'
import GameManagement from './pages/GameManagement'
import PublicDisplay from './pages/PublicDisplay'
import Login from './pages/Login'

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
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
