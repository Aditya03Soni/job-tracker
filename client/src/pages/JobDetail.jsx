import { useState, useEffect } from 'react'
import { api } from '../api.js'

const STATUS_OPTIONS = ['Saved', 'Applied', 'Interviewing', 'Offer', 'Rejected', 'Withdrawn']
const KIT_TABS = [
  { id: 'resume', label: 'Resume LaTeX' },
  { id: 'cover_letter', label: 'Cover Letter' },
  { id: 'interview', label: "Interview Q's" },
  { id: 'company', label: 'Company Brief' },
]

export default function JobDetail({ jobId, onBack }) {
  const [job, setJob] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [generatingKit, setGeneratingKit] = useState(false)
  const [kitError, setKitError] = useState(null)
  const [kitTab, setKitTab] = useState('resume')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    api.jobs.get(jobId).then(setJob).finally(() => setLoading(false))
  }, [jobId])

  async function save(fields) {
    setSaving(true)
    const updated = await api.jobs.update(jobId, fields)
    setJob(updated)
    setSaving(false)
  }

  async function generateKit() {
    setGeneratingKit(true)
    setKitError(null)
    try {
      const result = await api.jobs.generateKit(jobId)
      if (result.error) throw new Error(result.error)
      setJob(j => ({ ...j, kit: result.kit }))
    } catch (err) {
      setKitError(err.message)
    } finally {
      setGeneratingKit(false)
    }
  }

  function copy(text) {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) return <div className="loading">Loading...</div>
  if (!job) return <div className="error-msg">Job not found.</div>

  return (
    <div>
      <div className="page-header">
        <button className="btn-back" onClick={onBack}>
          ← Back
        </button>
        {saving && <span className="saving-indicator">Saving...</span>}
      </div>

      <div className="job-detail-layout">
        {/* Left: Job info */}
        <div className="job-detail-info">
          <EditableField label="Title" value={job.title} onSave={v => save({ title: v })} />
          <EditableField label="Company" value={job.company} onSave={v => save({ company: v })} />
          <EditableField label="Location" value={job.location} onSave={v => save({ location: v })} />
          <EditableField label="URL" value={job.url} onSave={v => save({ url: v })} />

          <div className="field-row">
            <label>Status</label>
            <select value={job.status} onChange={e => save({ status: e.target.value })}>
              {STATUS_OPTIONS.map(s => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>

          <EditableField
            label="Notes"
            value={job.notes}
            multiline
            rows={3}
            onSave={v => save({ notes: v })}
          />
          <EditableField
            label="Description"
            value={job.description}
            multiline
            rows={10}
            onSave={v => save({ description: v })}
          />

          {job.url && (
            <a
              href={job.url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary"
              style={{ display: 'inline-block', marginTop: '0.5rem' }}
            >
              Open Job Posting ↗
            </a>
          )}
        </div>

        {/* Right: Kit */}
        <div className="job-detail-kit">
          <div className="kit-header">
            <h2>Application Kit</h2>
            <button className="btn-primary" onClick={generateKit} disabled={generatingKit}>
              {generatingKit ? 'Generating...' : job.kit ? 'Regenerate Kit' : 'Generate Kit'}
            </button>
          </div>

          {generatingKit && (
            <div className="kit-loading">
              <div className="spinner" />
              <p>Tailoring resume, cover letter &amp; interview prep… (30–60 s)</p>
            </div>
          )}

          {kitError && <div className="error-msg">{kitError}</div>}

          {job.kit && !generatingKit && (
            <>
              {job.kit.ats_analysis?.score !== null && job.kit.ats_analysis && (
                <AtsScoreBar ats={job.kit.ats_analysis} />
              )}

              <div className="kit-tabs">
                {KIT_TABS.map(t => (
                  <button
                    key={t.id}
                    className={kitTab === t.id ? 'active' : ''}
                    onClick={() => setKitTab(t.id)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {kitTab === 'resume' && (
                <div className="kit-content">
                  <button className="copy-btn" onClick={() => copy(job.kit.resume_latex)}>
                    {copied ? 'Copied!' : 'Copy LaTeX'}
                  </button>
                  <pre className="code-block">{job.kit.resume_latex}</pre>
                </div>
              )}

              {kitTab === 'cover_letter' && (
                <div className="kit-content">
                  <button className="copy-btn" onClick={() => copy(job.kit.cover_letter)}>
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                  <div className="prose">{job.kit.cover_letter}</div>
                </div>
              )}

              {kitTab === 'interview' && (
                <div className="kit-content">
                  <ol className="interview-list">
                    {(job.kit.interview_questions || []).map((q, i) => (
                      <li key={i}>{q}</li>
                    ))}
                  </ol>
                </div>
              )}

              {kitTab === 'company' && (
                <div className="kit-content">
                  <div className="prose">{job.kit.company_brief}</div>
                </div>
              )}
            </>
          )}

          {!job.kit && !generatingKit && (
            <div className="empty" style={{ padding: '2rem 0' }}>
              Generate a kit to get a tailored resume, cover letter, and interview prep for this job.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function EditableField({ label, value, onSave, multiline, rows = 4 }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value || '')

  useEffect(() => {
    setDraft(value || '')
  }, [value])

  function commit() {
    setEditing(false)
    if (draft !== (value || '')) onSave(draft)
  }

  return (
    <div className="field-row">
      <label>{label}</label>
      {editing ? (
        multiline ? (
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            rows={rows}
            autoFocus
          />
        ) : (
          <input
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={e => e.key === 'Enter' && commit()}
            autoFocus
          />
        )
      ) : (
        <div className="field-value" onClick={() => setEditing(true)}>
          {value || <span className="placeholder">Click to edit</span>}
        </div>
      )}
    </div>
  )
}

function AtsScoreBar({ ats }) {
  const { score, matched_keywords = [], missing_keywords = [] } = ats
  const color = score >= 70 ? '#10b981' : score >= 40 ? '#f59e0b' : '#ef4444'

  return (
    <div className="ats-card">
      <div className="ats-header">
        <span>ATS Score</span>
        <span className="ats-score" style={{ color }}>
          {score}%
        </span>
      </div>
      <div className="ats-bar-track">
        <div className="ats-bar-fill" style={{ width: `${score}%`, background: color }} />
      </div>
      {matched_keywords.length > 0 && (
        <div className="ats-keywords">
          <span className="kw-label">Matched:</span>
          {matched_keywords.map(k => (
            <span key={k} className="kw-chip matched">
              {k}
            </span>
          ))}
        </div>
      )}
      {missing_keywords.length > 0 && (
        <div className="ats-keywords">
          <span className="kw-label">Missing:</span>
          {missing_keywords.map(k => (
            <span key={k} className="kw-chip missing">
              {k}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
