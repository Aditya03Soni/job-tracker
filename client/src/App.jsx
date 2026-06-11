import { useState, useEffect, useCallback } from 'react'
import { api } from './lib/api'
import Board from './components/Board'
import CardDetail from './components/CardDetail'
import AddJobModal from './components/AddJobModal'
import Settings from './components/Settings'

export default function App() {
  const [jobs, setJobs] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [toast, setToast] = useState(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [ranking, setRanking] = useState(false)

  const showToast = useCallback((msg, duration = 2500) => {
    setToast(msg)
    setTimeout(() => setToast(null), duration)
  }, [])

  useEffect(() => {
    api.jobs.list()
      .then(setJobs)
      .catch(() => showToast('Could not connect to server. Is it running?', 5000))
      .finally(() => setLoading(false))
  }, [])

  async function handleStatusChange(jobId, newStatus) {
    const updated = await api.jobs.update(jobId, { status: newStatus })
    if (updated?.error) return showToast(updated.error, 3000)
    setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: newStatus } : j))
  }

  async function handleAddJob(fields) {
    const job = await api.jobs.create(fields)
    if (job?.error) { showToast(job.error, 3000); return }
    setJobs(prev => [...prev, job])
    setShowAdd(false)
    showToast('Job added')
  }

  async function handleDeleteJob(jobId) {
    await api.jobs.delete(jobId)
    setJobs(prev => prev.filter(j => j.id !== jobId))
    if (selectedId === jobId) setSelectedId(null)
    showToast('Job deleted')
  }

  async function handleUpdateJob(jobId, fields) {
    const updated = await api.jobs.update(jobId, fields)
    if (updated?.error) { showToast(updated.error, 3000); return }
    setJobs(prev => prev.map(j => j.id === jobId ? updated : j))
  }

  async function handleSyncApify() {
    setSyncing(true)
    try {
      const res = await api.apify.sync()
      if (res?.error) { showToast(`Apify sync failed: ${res.error}`, 4000); return }
      const { added = 0, skipped = 0 } = res || {}
      if (added > 0) {
        const fresh = await api.jobs.list()
        setJobs(fresh)
      }
      showToast(added > 0
        ? `${added} new job${added !== 1 ? 's' : ''} added from Apify`
        : `All ${skipped} jobs already tracked`)
    } catch (err) {
      showToast(`Apify sync failed: ${err.message}`, 4000)
    } finally {
      setSyncing(false)
    }
  }

  async function handleRankJobs() {
    setRanking(true)
    try {
      const res = await api.jobs.rankAll()
      if (res?.error) { showToast(`Ranking failed: ${res.error}`, 4000); return }
      const { ranked = 0, jobs: updatedJobs = [] } = res || {}
      if (updatedJobs.length > 0) setJobs(updatedJobs)
      showToast(`Ranked ${ranked} job${ranked !== 1 ? 's' : ''} by fit`)
    } catch (err) {
      showToast(`Ranking failed: ${err.message}`, 4000)
    } finally {
      setRanking(false)
    }
  }

  const selectedJob = jobs.find(j => j.id === selectedId) || null

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">Job Tracker</h1>
        <div className="header-actions">
          <button className="btn btn-secondary" onClick={handleSyncApify} disabled={syncing}>
            {syncing ? 'Syncing…' : '↻ Sync Apify'}
          </button>
          <button className="btn btn-secondary" onClick={handleRankJobs} disabled={ranking}>
            {ranking ? 'Ranking…' : '⇅ Rank Jobs'}
          </button>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
            + Add Job
          </button>
          <button className="btn btn-icon" onClick={() => setShowSettings(true)} title="Settings">
            ⚙
          </button>
        </div>
      </header>

      {loading ? (
        <div className="loading-screen">Loading jobs…</div>
      ) : (
        <Board
          jobs={jobs}
          onSelectJob={setSelectedId}
          onStatusChange={handleStatusChange}
          onDeleteJob={handleDeleteJob}
        />
      )}

      {selectedJob && (
        <CardDetail
          job={selectedJob}
          onClose={() => setSelectedId(null)}
          onUpdate={handleUpdateJob}
          onDelete={handleDeleteJob}
          showToast={showToast}
          setJobs={setJobs}
        />
      )}

      {showAdd && (
        <AddJobModal
          onClose={() => setShowAdd(false)}
          onAdd={handleAddJob}
          showToast={showToast}
        />
      )}

      {showSettings && (
        <Settings onClose={() => setShowSettings(false)} showToast={showToast} />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
