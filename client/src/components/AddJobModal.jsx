import { useState } from 'react'
import { api } from '../lib/api'

const EMPTY = { title: '', company: '', location: '', url: '', description: '', status: 'Saved' }

export default function AddJobModal({ onClose, onAdd, showToast }) {
  const [fields, setFields] = useState(EMPTY)
  const [parsing, setParsing] = useState(false)

  function set(k, v) { setFields(f => ({ ...f, [k]: v })) }

  async function handleParseUrl() {
    if (!fields.url.trim()) return showToast('Enter a URL first', 2000)
    setParsing(true)
    try {
      const result = await api.parseUrl(fields.url.trim())
      if (result?.error) { showToast(result.error, 3000); return }
      setFields(f => ({
        ...f,
        title:       result.title       || f.title,
        company:     result.company     || f.company,
        location:    result.location    || f.location,
        description: result.description || f.description,
      }))
      showToast('Job details filled from URL')
    } catch (err) {
      showToast(`Parse failed: ${err.message}`, 3000)
    } finally {
      setParsing(false)
    }
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!fields.title.trim() || !fields.company.trim()) {
      showToast('Title and company are required', 2000)
      return
    }
    onAdd(fields)
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h2>Add Job</h2>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-form">
          <div className="url-row">
            <input
              className="edit-input"
              placeholder="Job posting URL (optional)"
              value={fields.url}
              onChange={e => set('url', e.target.value)}
            />
            <button type="button" className="btn btn-secondary" onClick={handleParseUrl} disabled={parsing}>
              {parsing ? 'Parsing…' : 'Fill from URL'}
            </button>
          </div>
          <input className="edit-input" placeholder="Job title *" value={fields.title} onChange={e => set('title', e.target.value)} required />
          <input className="edit-input" placeholder="Company *" value={fields.company} onChange={e => set('company', e.target.value)} required />
          <input className="edit-input" placeholder="Location" value={fields.location} onChange={e => set('location', e.target.value)} />
          <textarea
            className="edit-textarea"
            placeholder="Job description (paste here for AI kit generation)"
            value={fields.description}
            onChange={e => set('description', e.target.value)}
            rows={6}
          />
          <select className="status-select" value={fields.status} onChange={e => set('status', e.target.value)}>
            <option>Saved</option>
            <option>Applied</option>
            <option>Interviewing</option>
            <option>Offer</option>
            <option>Rejected</option>
          </select>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary">Add Job</button>
          </div>
        </form>
      </div>
    </div>
  )
}
