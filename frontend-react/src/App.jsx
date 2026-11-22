import { Navigate, Route, Routes } from 'react-router-dom'
import PrintTicket from './pages/PrintTicket'
import WeighScreen from './pages/WeighScreen'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/tram-can" replace />} />
      <Route path="/tram-can" element={<WeighScreen />} />
      <Route path="/in-phieu/:ticketUuid" element={<PrintTicket />} />
      <Route path="*" element={<Navigate to="/tram-can" replace />} />
    </Routes>
  )
}

export default App