import { useState, useEffect } from 'react'
import { api } from '../api.js'

const STATUS_COLORS = {
  Saved: '#6b7280',
  Applied: '#3b82f6',
  Interviewing: '#f59e0b',
  Offer: '#10b981',
  Rejected: '#ef4444',
  Withdrawn: '#9ca3af',
}
const STATUSES = ['All', 'Saved', 'Applied', 'Interviewing', 'Offer', 'Rejected', 'Withdrawn']

export default function JobList({ onSelect }) {
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('All')
  const [showAdd, setShowAdd] = useState(false)

  useEffect(() => {
    api.jobs.list().then(setJobs).finally(() => setLoading(false))
  }, [])

  const filtered = filter === 'All' ? jobs : jobs.filter(j => j.status === filter)

  async function handleDelete(e, id) {
    e.stopPropagation()
    if (!confirm('Delete this job?')) return
    await api.jobs.delete(id)
    setJobs(js => js.filter(j => j.id !== id))
  }

  return (
    <div>
      <div className="page-header">
        <h1>
          Jobs <span className="count">{jobs.length}</span>
        </h1>
        <button className="btn-primary" onClick={() => setShowAdd(true)}>
          + Add Job
        </button>
      </div>

      <div className="filter-bar">
        {STATUSES.map(s => (
          <button
            key={s}
            className={`filter-btn${filter === s ? ' active' : ''}`}
            onClick={() => setFilter(s)}
          >
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loading">Loading...</div>
      ) : (
        <div className="job-list">
          {filtered.length === 0 && (
            <div className="empty">
              {jobs.length === 0
                ? 'No jobs yet. Click "+ Add Job" to get started.'
                : `No jobs with status "${filter}".`}
            </div>
          )}
          {filtered.map(job => (
            <div key={job.id} className="job-card" onClick={() => onSelect(job.id)}>
              <div className="job-card-main">
                <div className="job-title">{job.title || '(untitled)'}</div>
                <div className="job-company">
                  {job.company}
                  {job.location ? ` · ${job.location}` : ''}
                </div>
              </div>
              <div className="job-card-meta">
                <span
                  className="status-badge"
                  style={{ background: STATUS_COLORS[job.status] || '#6b7280' }}
                >
                  {job.status}
                </span>
                {job.kit && <span className="kit-badge">Kit ✓</span>}
                <button className="btn-icon" onClick={e => handleDelete(e, job.id)} title="Delete">
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <AddJobModal
          onClose={() => setShowAdd(false)}
          onAdd={job => {
            setJobs(js => [...js, job])
            setShowAdd(false)
          }}
        />
      )}
    </div>
  )
}

function AddJobModal({ onClose, onAdd }) {
  const [form, setForm] = useState({
    title: '',
    company: '',
    location: '',
    url: '',
    description: '',
    status: 'Saved',
  })
  const [urlInput, setUrlInput] = useState('')
  const [parsing, setParsing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [parseError, setParseError] = useState(null)

  function set(k, v) {
    setForm(f => ({ ...f, [k]: v }))
  }

  async function parseUrl() {
    if (!urlInput.trim()) return
    setParsing(true)
    setParseError(null)
    try {
      const data = await api.parseUrl(urlInput.trim())
      if (data.error) throw new Error(data.error)
      setForm(f => ({ ...f, ...data, url: urlInput.trim() }))
    } catch (err) {
      setParseError(err.message)
    } finally {
      setParsing(false)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    const job = await api.jobs.create(form)
    onAdd(job)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add Job</h2>
          <button onClick={onClose}>✕</button>
        </div>

        <div className="url-parse-row">
          <input
            placeholder="Paste job URL to auto-fill..."
            value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && parseUrl()}
          />
          <button onClick={parseUrl} disabled={parsing}>
            {parsing ? 'Parsing...' : 'Parse URL'}
          </button>
        </div>
        {parseError && <div className="error-msg" style={{ marginBottom: '0.75rem' }}>{parseError}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <label>Title</label>
            <input value={form.title} onChange={e => set('title', e.target.value)} />
          </div>
          <div className="form-row">
            <label>Company</label>
            <input value={form.company} onChange={e => set('company', e.target.value)} />
          </div>
          <div className="form-row">
            <label>Location</label>
            <input value={form.location} onChange={e => set('location', e.target.value)} />
          </div>
          <div className="form-row">
            <label>Status</label>
            <select value={form.status} onChange={e => set('status', e.target.value)}>
              {STATUSES.filter(s => s !== 'All').map(s => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <label>Description</label>
            <textarea
              value={form.description}
              onChange={e => set('description', e.target.value)}
              rows={6}
            />
          </div>
          <div className="modal-actions">
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Adding...' : 'Add Job'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
