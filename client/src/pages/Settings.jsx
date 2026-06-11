import { useState, useEffect } from 'react'
import { api } from '../api.js'

const EMPTY = {
  profile: '',
  openrouter_api_key: '',
  openrouter_model: '',
  keyword_model: '',
  apify_api_key: '',
  apify_actor_id: '',
}

export default function Settings() {
  const [settings, setSettings] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    api.settings.get().then(s => setSettings(prev => ({ ...prev, ...s })))
  }, [])

  function set(k, v) {
    setSettings(s => ({ ...s, [k]: v }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    await api.settings.update(settings)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div>
      <h1 style={{ marginBottom: '1.5rem' }}>Settings</h1>
      <form onSubmit={handleSubmit} className="settings-form">
        <section>
          <h2>Candidate Profile</h2>
          <p className="hint">
            Paste your full resume text or career summary. The AI uses this to generate tailored
            bullets and cover letters.
          </p>
          <textarea
            value={settings.profile}
            onChange={e => set('profile', e.target.value)}
            rows={14}
            placeholder="Paste your full resume / career profile here..."
          />
        </section>

        <section>
          <h2>OpenRouter</h2>
          <div className="form-row">
            <label>API Key</label>
            <input
              type="password"
              value={settings.openrouter_api_key}
              onChange={e => set('openrouter_api_key', e.target.value)}
              placeholder="sk-or-..."
              autoComplete="off"
            />
          </div>
          <div className="form-row">
            <label>Kit Model</label>
            <input
              value={settings.openrouter_model}
              onChange={e => set('openrouter_model', e.target.value)}
              placeholder="anthropic/claude-sonnet-4-5 (default)"
            />
          </div>
          <div className="form-row">
            <label>Keyword Model</label>
            <input
              value={settings.keyword_model}
              onChange={e => set('keyword_model', e.target.value)}
              placeholder="openai/gpt-4o-mini (default)"
            />
          </div>
        </section>

        <section>
          <h2>Apify (optional)</h2>
          <p className="hint">
            Used for scraping job descriptions from URLs and fetching live job recommendations.
          </p>
          <div className="form-row">
            <label>API Key</label>
            <input
              type="password"
              value={settings.apify_api_key}
              onChange={e => set('apify_api_key', e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="form-row">
            <label>Actor ID</label>
            <input
              value={settings.apify_actor_id}
              onChange={e => set('apify_actor_id', e.target.value)}
              placeholder="e.g. apify/linkedin-jobs-scraper"
            />
          </div>
        </section>

        <div>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Saving...' : saved ? 'Saved ✓' : 'Save Settings'}
          </button>
        </div>
      </form>
    </div>
  )
}
