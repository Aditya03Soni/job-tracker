import { useState, useEffect } from 'react'
import { api } from '../lib/api'

export default function Settings({ onClose, showToast }) {
  const [settings, setSettings] = useState({
    profile: '',
    openrouter_api_key: '',
    openrouter_model: 'anthropic/claude-3.5-sonnet',
    apify_api_key: '',
    apify_actor_id: '',
    keyword_model: 'openai/gpt-4o-mini',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.settings.get().then(data => {
      setSettings(s => ({ ...s, ...data }))
      setLoading(false)
    })
  }, [])

  function set(k, v) { setSettings(s => ({ ...s, [k]: v })) }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await api.settings.update(settings)
      showToast('Settings saved')
    } catch (err) {
      showToast(`Save failed: ${err.message}`, 3000)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-wide">
        <div className="modal-header">
          <h2>Settings</h2>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>
        {loading ? (
          <div className="loading-screen">Loading…</div>
        ) : (
          <form onSubmit={handleSave} className="modal-form">
            <label className="edit-label">Your Profile / Resume Background</label>
            <textarea
              className="edit-textarea"
              placeholder="Paste your resume, LinkedIn bio, or a brief background here. Used to tailor AI kit generation."
              value={settings.profile}
              onChange={e => set('profile', e.target.value)}
              rows={8}
            />

            <label className="edit-label">OpenRouter API Key</label>
            <input
              className="edit-input"
              type="password"
              placeholder="sk-or-..."
              value={settings.openrouter_api_key}
              onChange={e => set('openrouter_api_key', e.target.value)}
            />

            <label className="edit-label">OpenRouter Model (for kit generation)</label>
            <input
              className="edit-input"
              placeholder="anthropic/claude-3.5-sonnet"
              value={settings.openrouter_model}
              onChange={e => set('openrouter_model', e.target.value)}
            />

            <label className="edit-label">Keyword Model (for ATS extraction)</label>
            <input
              className="edit-input"
              placeholder="openai/gpt-4o-mini"
              value={settings.keyword_model}
              onChange={e => set('keyword_model', e.target.value)}
            />

            <label className="edit-label">Apify API Key</label>
            <input
              className="edit-input"
              type="password"
              placeholder="apify_api_..."
              value={settings.apify_api_key}
              onChange={e => set('apify_api_key', e.target.value)}
            />

            <label className="edit-label">Apify Actor ID</label>
            <input
              className="edit-input"
              placeholder="e.g. apify/linkedin-jobs-scraper"
              value={settings.apify_actor_id}
              onChange={e => set('apify_actor_id', e.target.value)}
            />

            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving…' : 'Save Settings'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
