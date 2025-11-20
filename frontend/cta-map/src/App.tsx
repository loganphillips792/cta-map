import { Route, Routes } from 'react-router-dom'
import HomePage from './pages/HomePage'
import StatsPage from './pages/StatsPage'
import MapPage from './pages/MapPage'
import './App.css'

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/stats" element={<StatsPage />} />
      <Route path="/map" element={<MapPage />} />
    </Routes>
  )
}

export default App
