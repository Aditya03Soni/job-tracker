const BASE = 'http://localhost:3001/api'

async function req(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    ...opts,
  })
  return res.json()
}

function json(method, path, body) {
  return req(path, { method, body: JSON.stringify(body) })
}

export const api = {
  jobs: {
    list: () => req('/jobs'),
    get: id => req(`/jobs/${id}`),
    create: body => json('POST', '/jobs', body),
    update: (id, body) => json('PUT', `/jobs/${id}`, body),
    delete: id => req(`/jobs/${id}`, { method: 'DELETE' }),
    generateKit: id => req(`/jobs/${id}/kit`, { method: 'POST' }),
  },
  settings: {
    get: () => req('/settings'),
    update: body => json('PUT', '/settings', body),
  },
  parseUrl: url => json('POST', '/parse-url', { url }),
  recommendations: {
    get: body => json('POST', '/recommendations', body),
    save: recId => req(`/recommendations/${recId}/save`, { method: 'POST' }),
    refresh: () => req('/recommendations/refresh', { method: 'POST' }),
  },
}
