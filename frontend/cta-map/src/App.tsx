import { Navigate, Route, Routes } from 'react-router-dom'
import StatsPage from './pages/StatsPage'
import MapPage from './pages/MapPage'
import NotFoundPage from './pages/NotFoundPage'
import './App.css'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/map" replace />} />
      <Route path="/stats" element={<StatsPage />} />
      <Route path="/map" element={<MapPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

export default App
