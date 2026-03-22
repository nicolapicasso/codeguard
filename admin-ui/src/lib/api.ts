const BASE = '';

let authToken: string | null = localStorage.getItem('cg_token');

export function setToken(token: string | null) {
  authToken = token;
  if (token) {
    localStorage.setItem('cg_token', token);
  } else {
    localStorage.removeItem('cg_token');
  }
}

export function getToken() {
  return authToken;
}

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...(opts.headers as Record<string, string> || {}),
  };

  // Only set Content-Type for requests with a body
  if (opts.body) {
    headers['Content-Type'] = 'application/json';
  }

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const res = await fetch(`${BASE}${path}`, { ...opts, headers });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.error_message || body.error_code || 'Request failed', body);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
  }
}

// --- Auth ---

export const auth = {
  login: (username: string, password: string) =>
    request<{ token: string; expires_in: string; user: { id: string; username: string; role: string } }>(
      '/api/admin/auth/login',
      { method: 'POST', body: JSON.stringify({ username, password }) },
    ),
};

// --- Tenants ---

export const tenants = {
  list: () => request<any[]>('/api/admin/tenants'),
  get: (id: string) => request<any>(`/api/admin/tenants/${id}`),
  create: (data: any) => request<any>('/api/admin/tenants', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: any) => request<any>(`/api/admin/tenants/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  rotateKeys: (id: string) => request<any>(`/api/admin/tenants/${id}/rotate-keys`, { method: 'POST' }),
};

// --- Projects ---

export const projects = {
  list: (tenantId: string) => request<any[]>(`/api/admin/tenants/${tenantId}/projects`),
  get: (id: string) => request<any>(`/api/admin/projects/${id}`),
  create: (tenantId: string, data: any) => request<any>(`/api/admin/tenants/${tenantId}/projects`, { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: any) => request<any>(`/api/admin/projects/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => request<void>(`/api/admin/projects/${id}`, { method: 'DELETE' }),
};

// --- Code Rules ---

export const codeRules = {
  list: (projectId: string) => request<any[]>(`/api/admin/projects/${projectId}/rules`),
  get: (id: string) => request<any>(`/api/admin/rules/${id}`),
  create: (projectId: string, data: any) => request<any>(`/api/admin/projects/${projectId}/rules`, { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: any) => request<any>(`/api/admin/rules/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => request<void>(`/api/admin/rules/${id}`, { method: 'DELETE' }),
  test: (id: string, code: string) => request<any>(`/api/admin/rules/${id}/test`, { method: 'POST', body: JSON.stringify({ code }) }),
};

// --- Batches ---

export const batches = {
  list: (params?: { code_rule_id?: string; project_id?: string; status?: string; page?: number; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.code_rule_id) qs.set('code_rule_id', params.code_rule_id);
    if (params?.project_id) qs.set('project_id', params.project_id);
    if (params?.status) qs.set('status', params.status);
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    const q = qs.toString();
    return request<any>(`/api/admin/batches${q ? `?${q}` : ''}`);
  },
  get: (id: string) => request<any>(`/api/admin/batches/${id}`),
  create: (ruleId: string, data: { batch_size: number; label?: string; expires_at?: string; format?: string }) =>
    request<any>(`/api/admin/rules/${ruleId}/batches`, { method: 'POST', body: JSON.stringify(data) }),
  download: (id: string, format: 'csv' | 'json' = 'csv') =>
    fetch(`/api/admin/batches/${id}/download?format=${format}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    }),
  cancel: (id: string) => request<any>(`/api/admin/batches/${id}/cancel`, { method: 'POST' }),
  seal: (id: string) => request<any>(`/api/admin/batches/${id}/seal`, { method: 'POST' }),
};

// --- Stats ---

export const stats = {
  project: (projectId: string) => request<any>(`/api/v1/stats/${projectId}`),
  overview: () => request<any>('/api/admin/stats/overview'),
  tenant: (tenantId: string, days = 30) => request<any>(`/api/admin/stats/tenant/${tenantId}?days=${days}`),
  adminProject: (projectId: string, days = 30) => request<any>(`/api/admin/stats/project/${projectId}?days=${days}`),
};

// --- Fraud Detection ---

export const fraud = {
  overview: (tenantId?: string, days = 7) => {
    const qs = new URLSearchParams();
    if (tenantId) qs.set('tenant_id', tenantId);
    qs.set('days', String(days));
    return request<any>(`/api/admin/fraud/overview?${qs}`);
  },
  attempts: (params: Record<string, any> = {}) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) { if (v) qs.set(k, String(v)); }
    return request<any>(`/api/admin/fraud/attempts?${qs}`);
  },
  suspiciousIps: (tenantId?: string, days = 7, minAttempts = 5) => {
    const qs = new URLSearchParams();
    if (tenantId) qs.set('tenant_id', tenantId);
    qs.set('days', String(days));
    qs.set('min_attempts', String(minAttempts));
    return request<any>(`/api/admin/fraud/suspicious-ips?${qs}`);
  },
  suspiciousUsers: (tenantId?: string, days = 7, minAttempts = 3) => {
    const qs = new URLSearchParams();
    if (tenantId) qs.set('tenant_id', tenantId);
    qs.set('days', String(days));
    qs.set('min_attempts', String(minAttempts));
    return request<any>(`/api/admin/fraud/suspicious-users?${qs}`);
  },
  geoBlocked: (tenantId?: string, days = 30) => {
    const qs = new URLSearchParams();
    if (tenantId) qs.set('tenant_id', tenantId);
    qs.set('days', String(days));
    return request<any>(`/api/admin/fraud/geo-blocked?${qs}`);
  },
};

// --- Health ---

export const health = {
  check: () => request<any>('/health'),
  ready: () => request<any>('/health/ready'),
};
