const ACTOR_KEY = 'aura.actor';
const TOKEN_KEY = 'aura.token';

export function getActorId() {
  return localStorage.getItem(ACTOR_KEY) || 'usr-krishnan';
}

export function setActorId(id) {
  if (id) {
    localStorage.setItem(ACTOR_KEY, id);
  } else {
    localStorage.removeItem(ACTOR_KEY);
  }
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setToken(token) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ACTOR_KEY);
}

export async function api(path, { method = 'GET', body, actorId, token } = {}) {
  const currentToken = token || getToken();
  const currentActorId = actorId || getActorId();

  const headers = {
    'Content-Type': 'application/json',
    'x-actor-id': currentActorId,
  };

  if (currentToken) {
    headers['Authorization'] = `Bearer ${currentToken}`;
  }

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = new Error(data?.message || data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const endpoints = {
  login: (body) => api('/auth/login', { method: 'POST', body }),
  me: () => api('/auth/me'),
  logout: () => api('/auth/logout', { method: 'POST' }),
  bootstrap: () => api('/bootstrap'),
  metrics: () => api('/metrics'),
  runs: (query = '') => api(`/runs${query}`),
  run: (id) => api(`/runs/${id}`),
  runAudit: (id) => api(`/runs/${id}/audit`),
  clarify: (body) => api('/intake/clarify', { method: 'POST', body }),
  planPreview: (body) => api('/plan/preview', { method: 'POST', body }),
  startRun: (body) => api('/runs', { method: 'POST', body }),
  resume: (id) => api(`/runs/${id}/resume`, { method: 'POST', body: {} }),
  inject: (id, faults) => api(`/runs/${id}/inject`, { method: 'POST', body: { faults } }),
  review: (id, body) => api(`/runs/${id}/review`, { method: 'POST', body }),
  rollback: (id, versionId) => api(`/runs/${id}/rollback`, { method: 'POST', body: { versionId } }),
  calls: (q = '') => api(`/calls${q}`),
  call: (id) => api(`/calls/${id}`),
  literature: (q = '') => api(`/literature${q}`),
  policies: () => api('/policies'),
  agents: () => api('/agents'),
  connector: () => api('/connector'),
  invoke: (endpoint, args) => api('/connector/invoke', { method: 'POST', body: { endpoint, args } }),
  skills: () => api('/skills'),
  llmStatus: () => api('/llm/status'),
  generate: (body) => api('/llm/generate', { method: 'POST', body }),
  mongoStatus: () => api('/mongo/status'),
  users: () => api('/users'),
  projects: (q = '') => api(`/projects${q}`),
  project: (id) => api(`/projects/${encodeURIComponent(id)}`),
  saveProjectBudget: (id, lines) => api(`/projects/${encodeURIComponent(id)}/budget`, { method: 'PUT', body: { lines } }),
  reviseDraft: (id, sections) => api(`/runs/${id}/draft`, { method: 'PUT', body: { sections } }),
  person: (id) => api(`/people/${encodeURIComponent(id)}`),
  audit: (q = '') => api(`/audit${q}`),
  versions: () => api('/versions'),
  seedDemo: () => api('/demo', { method: 'POST' }),
  downloadUrl: (runId, name) => `/api/runs/${runId}/files/${encodeURIComponent(name)}`,
};
