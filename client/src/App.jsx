import { useState } from 'react'
import JobList from './pages/JobList.jsx'
import JobDetail from './pages/JobDetail.jsx'
import Recommendations from './pages/Recommendations.jsx'
import Settings from './pages/Settings.jsx'

const NAV = [
  { id: 'jobs', label: 'Jobs' },
  { id: 'recommendations', label: 'Recommendations' },
  { id: 'settings', label: 'Settings' },
]

export default function App() {
  const [page, setPage] = useState('jobs')
  const [selectedJobId, setSelectedJobId] = useState(null)

  function goToJob(id) {
    setSelectedJobId(id)
    setPage('job-detail')
  }

  const activePage = page === 'job-detail' ? 'jobs' : page

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-logo">Job Tracker</div>
        <nav>
          {NAV.map(n => (
            <button
              key={n.id}
              className={activePage === n.id ? 'active' : ''}
              onClick={() => setPage(n.id)}
            >
              {n.label}
            </button>
          ))}
        </nav>
      </aside>
      <main className="content">
        {page === 'jobs' && <JobList onSelect={goToJob} />}
        {page === 'job-detail' && (
          <JobDetail jobId={selectedJobId} onBack={() => setPage('jobs')} />
        )}
        {page === 'recommendations' && <Recommendations onSelectJob={goToJob} />}
        {page === 'settings' && <Settings />}
      </main>
    </div>
  )
}
