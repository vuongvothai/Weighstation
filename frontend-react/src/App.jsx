import { Navigate, Route, Routes } from 'react-router-dom'
import PrintTicket from './pages/PrintTicket'
import TicketHistory from './pages/TicketHistory'
import WeighScreen from './pages/WeighScreen'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/tram-can" replace />} />
      <Route path="/tram-can" element={<WeighScreen />} />
      <Route path="/chinh-sua/:ticketUuid" element={<WeighScreen />} />
      <Route path="/lich-su" element={<TicketHistory />} />
      <Route path="/in-phieu/:ticketUuid" element={<PrintTicket />} />
      <Route path="*" element={<Navigate to="/tram-can" replace />} />
    </Routes>
  )
}

export default App