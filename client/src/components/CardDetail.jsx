import { useState } from 'react'
import { api } from '../lib/api'

const STATUSES = ['Saved', 'Applied', 'Interviewing', 'Offer', 'Rejected']

const KIT_TABS = [
  { id: 'resume',    label: 'Resume (LaTeX)' },
  { id: 'cover',     label: 'Cover Letter' },
  { id: 'interview', label: 'Interview Q&A' },
  { id: 'ats',       label: 'ATS Score' },
]

function AtsBar({ analysis }) {
  if (!analysis) return <p className="muted">No ATS analysis yet. Generate kit first.</p>
  const { score, matched_keywords = [], missing_keywords = [] } = analysis
  return (
    <div className="ats-panel">
      <div className="ats-score-row">
        <span className="ats-label">Score</span>
        <span className="ats-score-value">{score ?? '—'}%</span>
      </div>
      <div className="ats-bar-track">
        <div className="ats-bar-fill" style={{ width: `${score ?? 0}%` }} />
      </div>
      {matched_keywords.length > 0 && (
        <div className="kw-section">
          <div className="kw-heading matched">Matched keywords</div>
          <div className="kw-list">{matched_keywords.map(k => <span key={k} className="kw-tag matched">{k}</span>)}</div>
        </div>
      )}
      {missing_keywords.length > 0 && (
        <div className="kw-section">
          <div className="kw-heading missing">Missing keywords</div>
          <div className="kw-list">{missing_keywords.map(k => <span key={k} className="kw-tag missing">{k}</span>)}</div>
        </div>
      )}
    </div>
  )
}

export default function CardDetail({ job, onClose, onUpdate, onDelete, showToast, setJobs }) {
  const [tab, setTab] = useState('resume')
  const [editing, setEditing] = useState(false)
  const [fields, setFields] = useState({ title: job.title, company: job.company, location: job.location || '', url: job.url || '', notes: job.notes || '' })
  const [generating, setGenerating] = useState(false)

  async function handleSave() {
    await onUpdate(job.id, fields)
    setEditing(false)
    showToast('Saved')
  }

  async function handleGenerateKit() {
    setGenerating(true)
    showToast('Generating kit… this may take 30–60s', 60000)
    try {
      const result = await api.jobs.generateKit(job.id)
      if (result?.error) { showToast(result.error, 5000); return }
      setJobs(prev => prev.map(j => j.id === job.id ? { ...j, kit: result.kit } : j))
      showToast('Kit generated!')
      setTab('resume')
    } catch (err) {
      showToast(`Kit generation failed: ${err.message}`, 5000)
    } finally {
      setGenerating(false)
    }
  }

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => showToast('Copied to clipboard'))
  }

  const kit = job.kit || {}

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="card-detail">
        <div className="detail-header">
          <div className="detail-title-row">
            {editing ? (
              <input className="edit-input" value={fields.title} onChange={e => setFields(f => ({ ...f, title: e.target.value }))} />
            ) : (
              <h2 className="detail-job-title">{job.title}</h2>
            )}
            <button className="btn-close" onClick={onClose}>✕</button>
          </div>
          {editing ? (
            <div className="edit-row">
              <input className="edit-input" placeholder="Company" value={fields.company} onChange={e => setFields(f => ({ ...f, company: e.target.value }))} />
              <input className="edit-input" placeholder="Location" value={fields.location} onChange={e => setFields(f => ({ ...f, location: e.target.value }))} />
            </div>
          ) : (
            <div className="detail-meta">{job.company}{job.location ? ` · ${job.location}` : ''}</div>
          )}
          <div className="detail-controls">
            <select
              className="status-select"
              value={job.status}
              onChange={e => onUpdate(job.id, { status: e.target.value })}
            >
              {STATUSES.map(s => <option key={s}>{s}</option>)}
            </select>
            {job.url && <a className="btn btn-secondary" href={job.url} target="_blank" rel="noreferrer">Open JD ↗</a>}
            {editing ? (
              <>
                <button className="btn btn-primary" onClick={handleSave}>Save</button>
                <button className="btn btn-secondary" onClick={() => setEditing(false)}>Cancel</button>
              </>
            ) : (
              <button className="btn btn-secondary" onClick={() => setEditing(true)}>Edit</button>
            )}
            <button className="btn btn-danger" onClick={() => { if (confirm('Delete this job?')) onDelete(job.id) }}>Delete</button>
          </div>
        </div>

        {editing && (
          <div className="edit-section">
            <label className="edit-label">URL</label>
            <input className="edit-input" value={fields.url} onChange={e => setFields(f => ({ ...f, url: e.target.value }))} />
            <label className="edit-label">Notes</label>
            <textarea className="edit-textarea" value={fields.notes} onChange={e => setFields(f => ({ ...f, notes: e.target.value }))} rows={4} />
          </div>
        )}

        <div className="detail-body">
          <div className="kit-header">
            <div className="kit-tabs">
              {KIT_TABS.map(t => (
                <button
                  key={t.id}
                  className={`kit-tab${tab === t.id ? ' active' : ''}`}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <button className="btn btn-primary" onClick={handleGenerateKit} disabled={generating}>
              {generating ? 'Generating…' : job.kit ? 'Regenerate Kit' : 'Generate Kit'}
            </button>
          </div>

          <div className="kit-content">
            {tab === 'resume' && (
              kit.resume_latex ? (
                <>
                  <button className="btn btn-secondary copy-btn" onClick={() => copyToClipboard(kit.resume_latex)}>Copy LaTeX</button>
                  <pre className="code-block">{kit.resume_latex}</pre>
                </>
              ) : <p className="muted">No resume generated yet.</p>
            )}
            {tab === 'cover' && (
              kit.cover_letter ? (
                <>
                  <button className="btn btn-secondary copy-btn" onClick={() => copyToClipboard(kit.cover_letter)}>Copy</button>
                  <div className="prose">{kit.cover_letter}</div>
                </>
              ) : <p className="muted">No cover letter generated yet.</p>
            )}
            {tab === 'interview' && (
              kit.interview_questions ? (
                <>
                  <button className="btn btn-secondary copy-btn" onClick={() => copyToClipboard(kit.interview_questions)}>Copy</button>
                  <div className="prose">{kit.interview_questions}</div>
                </>
              ) : <p className="muted">No interview Q&A generated yet.</p>
            )}
            {tab === 'ats' && <AtsBar analysis={kit.ats_analysis} />}
          </div>
        </div>
      </div>
    </div>
  )
}
