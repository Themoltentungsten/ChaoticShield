import { Routes, Route } from 'react-router'
import AppShell from './components/AppShell'
import ScrollToTop from './components/ScrollToTop'
import HomePage from './pages/HomePage'
import MethodologyPage from './pages/MethodologyPage'
import EncryptPage from './pages/EncryptPage'
import DecryptPage from './pages/DecryptPage'
import HistoryPage from './pages/HistoryPage'
import HistoryBrowsePage from './pages/HistoryBrowsePage'
import SelectivePage from './pages/SelectivePage'
import SelectiveDecryptPage from './pages/SelectiveDecryptPage'
import TeamPage from './pages/TeamPage'

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/methodology" element={<MethodologyPage />} />
          <Route path="/encrypt" element={<EncryptPage />} />
          <Route path="/selective" element={<SelectivePage />} />
          <Route path="/selective/decrypt" element={<SelectiveDecryptPage />} />
          <Route path="/decrypt" element={<DecryptPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/history/browse/:folder" element={<HistoryBrowsePage />} />
          <Route path="/team" element={<TeamPage />} />
        </Route>
      </Routes>
    </>
  )
}
