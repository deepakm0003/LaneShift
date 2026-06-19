import { Routes, Route } from 'react-router-dom'
import Nav              from './components/Nav'
import HeroSection      from './components/HeroSection'
import ProblemSection   from './components/ProblemSection'
import DataSection      from './components/DataSection'
import HowItWorks       from './components/HowItWorks'
import MapSection       from './components/MapSection'
import LiveDataSection  from './components/LiveDataSection'
import ClosingSection   from './components/ClosingSection'
import Footer           from './components/Footer'
import ResultsPage      from './pages/ResultsPage'
import DetectionPage     from './pages/DetectionPage'
import LiveDashboardPage  from './pages/LiveDashboardPage'
import HotspotsPage       from './pages/HotspotsPage'
import ChallanPage        from './pages/ChallanPage'
import LiveMonitorPage    from './pages/LiveMonitorPage'
import UploadDataPage     from './pages/UploadDataPage'

/* ── Main landing page ───────────────────────────────────────────────────── */
function LandingPage() {
  return (
    <>
      <Nav />
      <main>
        <HeroSection />
        <ProblemSection />
        <DataSection />
        <HowItWorks />
        <MapSection />
        <LiveDataSection />
        <ClosingSection />
      </main>
      <Footer />
    </>
  )
}

/* ── Router ──────────────────────────────────────────────────────────────── */
export default function App() {
  return (
    <Routes>
      <Route path="/"        element={<LandingPage />} />
      <Route path="/results" element={<ResultsPage />} />
      <Route path="/detect"   element={<DetectionPage />} />
      <Route path="/live"     element={<LiveDashboardPage />} />
      <Route path="/hotspots" element={<HotspotsPage />} />
      <Route path="/challan"  element={<ChallanPage />} />
      <Route path="/monitor"  element={<LiveMonitorPage />} />
      <Route path="/upload"   element={<UploadDataPage />} />
    </Routes>
  )
}
