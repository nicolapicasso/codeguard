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
    'Content-Type': 'application/json',
    ...(opts.headers as Record<string, string> || {}),
  };

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

// --- Stats ---

export const stats = {
  project: (projectId: string) => request<any>(`/api/v1/stats/${projectId}`),
};

// --- Health ---

export const health = {
  check: () => request<any>('/health'),
  ready: () => request<any>('/health/ready'),
};
