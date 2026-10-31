import { mockAdapter } from './mockAdapter';
import { ApiClientError } from './mockReplaySim';
import type {
  RunsResponse,
  LatestFindingResponse,
  Finding,
  CompareResponse,
  DependencyImpactsResponse,
  ProjectInfo,
  Assumptions,
  ApiError,
} from './types';

export { ApiClientError };

const STORAGE_KEY = 'buildcliff_use_mocks';

// Read default from env or localStorage
function getInitialUseMocks(): boolean {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved !== null) {
    return saved === 'true';
  }
  return import.meta.env.VITE_USE_MOCKS !== 'false';
}

let useMocks = getInitialUseMocks();

export function getUseMocks(): boolean {
  return useMocks;
}

export function setUseMocks(val: boolean) {
  useMocks = val;
  localStorage.setItem(STORAGE_KEY, String(val));
  window.dispatchEvent(new CustomEvent('buildcliff:mock-toggle', { detail: { useMocks: val } }));
}

const API_BASE = import.meta.env.VITE_API_BASE || '/api';
const DEFAULT_PROJECT = import.meta.env.VITE_PROJECT_ID || 'demo-app';
const DEFAULT_BRANCH = 'main';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = path.startsWith('http') ? path : `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;

  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  const contentType = res.headers.get('content-type') || '';
  let data: any = null;
  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }

  if (!res.ok) {
    const errorBody = data as ApiError | undefined;
    const msg = errorBody?.error?.message || `API request failed with status ${res.status}`;
    const code = errorBody?.error?.code || 'INTERNAL_ERROR';
    const field = errorBody?.error?.field || null;
    throw new ApiClientError(msg, code, field, res.status);
  }

  return data as T;
}

export const client = {
  async getRuns(projectId = DEFAULT_PROJECT, branch = DEFAULT_BRANCH, limit = 200): Promise<RunsResponse> {
    if (useMocks) return mockAdapter.getRuns();
    const params = new URLSearchParams({ project_id: projectId, branch, limit: String(limit) });
    return request<RunsResponse>(`/runs?${params.toString()}`);
  },

  async getLatestFinding(projectId = DEFAULT_PROJECT, step?: string): Promise<LatestFindingResponse> {
    if (useMocks) return mockAdapter.getLatestFinding(step);
    const params = new URLSearchParams({ project_id: projectId });
    if (step && step !== 'all') params.set('step', step);
    return request<LatestFindingResponse>(`/findings/latest?${params.toString()}`);
  },

  async getFindings(projectId = DEFAULT_PROJECT, status?: string): Promise<{ project_id: string; count: number; findings: Finding[] }> {
    if (useMocks) return mockAdapter.getFindings(status);
    const params = new URLSearchParams({ project_id: projectId });
    if (status) params.set('status', status);
    return request(`/findings?${params.toString()}`);
  },

  async getFinding(id: string): Promise<Finding> {
    if (useMocks) return mockAdapter.getFinding(id);
    return request<Finding>(`/findings/${encodeURIComponent(id)}`);
  },

  async getCompare(params: { findingId?: string; a?: string; b?: string }): Promise<CompareResponse> {
    if (useMocks) return mockAdapter.getCompare(params);
    const q = new URLSearchParams();
    if (params.findingId) q.set('finding_id', params.findingId);
    if (params.a) q.set('a', params.a);
    if (params.b) q.set('b', params.b);
    return request<CompareResponse>(`/compare?${q.toString()}`);
  },

  async getImpacts(projectId = DEFAULT_PROJECT): Promise<DependencyImpactsResponse> {
    if (useMocks) return mockAdapter.getImpacts();
    return request<DependencyImpactsResponse>(`/dependency-impacts?project_id=${projectId}`);
  },

  async getProject(projectId = DEFAULT_PROJECT): Promise<ProjectInfo> {
    if (useMocks) return mockAdapter.getProject();
    return request<ProjectInfo>(`/projects/${projectId}`);
  },

  async patchAssumptions(
    projectId = DEFAULT_PROJECT,
    partial: Partial<Assumptions>
  ): Promise<{ project_id: string; assumptions: Assumptions; findings_recomputed: number }> {
    if (useMocks) return mockAdapter.patchAssumptions(partial);
    return request(`/projects/${projectId}/assumptions`, {
      method: 'PATCH',
      body: JSON.stringify(partial),
    });
  },

  async replay(): Promise<{ status: string; total_steps: number; interval_ms: number }> {
    if (useMocks) return mockAdapter.replay();
    return request('/demo/replay', { method: 'POST' });
  },

  async reset(): Promise<{ status: string; deleted: Record<string, number> }> {
    if (useMocks) return mockAdapter.reset();
    return request('/demo/reset', { method: 'POST' });
  },
};

