import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import HostDashboard from './pages/HostDashboard'
import GameManagement from './pages/GameManagement'
import PublicDisplay from './pages/PublicDisplay'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Host routes */}
        <Route path="/" element={<HostDashboard />} />
        <Route path="/host" element={<HostDashboard />} />
        <Route path="/host/game/:id" element={<GameManagement />} />
        
        {/* Public display route */}
        <Route path="/display/:id" element={<PublicDisplay />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
