import { useState, useEffect } from 'react'
import { api } from '../api.js'

export default function Recommendations({ onSelectJob }) {
  const [role, setRole] = useState('')
  const [location, setLocation] = useState('')
  const [limit, setLimit] = useState(10)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)
  const [recs, setRecs] = useState([])
  const [source, setSource] = useState(null)
  const [lastRefresh, setLastRefresh] = useState(null)
  const [saved, setSaved] = useState(new Set())
  const [savedJobIds, setSavedJobIds] = useState({})

  async function fetchRecs() {
    setLoading(true)
    setError(null)
    try {
      const body = { limit }
      if (role.trim()) body.role = role.trim()
      if (location.trim()) body.location = location.trim()
      const result = await api.recommendations.get(body)
      if (result.error) throw new Error(result.error)
      setRecs(result.recommendations || [])
      setSource(result.source)
      setSaved(new Set())
      setSavedJobIds({})
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function manualRefresh() {
    setRefreshing(true)
    setError(null)
    try {
      const result = await api.recommendations.refresh()
      if (result.error) throw new Error(result.error)
      setLastRefresh(new Date().toISOString())
      // Re-fetch to display the new list
      const fresh = await api.recommendations.get(
        Object.assign({ limit }, role.trim() ? { role } : {}, location.trim() ? { location } : {})
      )
      if (!fresh.error) {
        setRecs(fresh.recommendations || [])
        setSource(fresh.source)
        setSaved(new Set())
        setSavedJobIds({})
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setRefreshing(false)
    }
  }

  async function saveRec(rec) {
    const result = await api.recommendations.save(rec.id)
    if (result.job) {
      setSaved(s => new Set([...s, rec.id]))
      setSavedJobIds(m => ({ ...m, [rec.id]: result.job.id }))
    }
  }

  function fmtRefresh(iso) {
    if (!iso) return null
    const d = new Date(iso)
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Recommendations</h1>
          {lastRefresh && (
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
              Last refreshed: {fmtRefresh(lastRefresh)}
            </div>
          )}
        </div>
        <button className="btn-secondary" onClick={manualRefresh} disabled={refreshing}>
          {refreshing ? 'Refreshing…' : '↻ Refresh Apify'}
        </button>
      </div>

      <div className="rec-controls">
        <input
          placeholder="Role (auto-detected from profile)"
          value={role}
          onChange={e => setRole(e.target.value)}
        />
        <input
          placeholder="Location (auto-detected from profile)"
          value={location}
          onChange={e => setLocation(e.target.value)}
        />
        <select value={limit} onChange={e => setLimit(Number(e.target.value))}>
          {[5, 10, 15, 20].map(n => (
            <option key={n} value={n}>
              {n} jobs
            </option>
          ))}
        </select>
        <button className="btn-primary" onClick={fetchRecs} disabled={loading}>
          {loading ? 'Loading...' : 'Get Recommendations'}
        </button>
      </div>

      {error && <div className="error-msg">{error}</div>}

      {source && (
        <div className="source-badge">
          Source: {source === 'apify' ? 'Apify (live listings)' : 'AI-generated suggestions'}
        </div>
      )}

      {recs.length > 0 && (
        <div className="rec-list">
          {recs.map(rec => (
            <div key={rec.id} className="rec-card">
              <div className="rec-header">
                <div>
                  <div className="rec-title">{rec.title}</div>
                  <div className="rec-company">
                    {rec.company}
                    {rec.location ? ` · ${rec.location}` : ''}
                  </div>
                </div>
                <div className="rec-actions">
                  {rec.url && (
                    <a
                      href={rec.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-secondary btn-sm"
                    >
                      View ↗
                    </a>
                  )}
                  {saved.has(rec.id) ? (
                    <>
                      <span className="btn-saved">Saved ✓</span>
                      <button
                        className="btn-secondary btn-sm"
                        onClick={() => onSelectJob(savedJobIds[rec.id])}
                      >
                        Open →
                      </button>
                    </>
                  ) : (
                    <button className="btn-primary btn-sm" onClick={() => saveRec(rec)}>
                      Save Job
                    </button>
                  )}
                </div>
              </div>

              {rec.match_reasoning && (
                <div className="rec-reasoning">
                  <strong>Why it matches:</strong> {rec.match_reasoning}
                </div>
              )}

              {rec.description && (
                <details className="rec-description">
                  <summary>Job Description</summary>
                  <p>
                    {rec.description.length > 600
                      ? rec.description.slice(0, 600) + '…'
                      : rec.description}
                  </p>
                </details>
              )}
            </div>
          ))}
        </div>
      )}

      {!loading && recs.length === 0 && (
        <div className="empty">
          Click "Get Recommendations" to find matching jobs based on your profile.
        </div>
      )}
    </div>
  )
}
