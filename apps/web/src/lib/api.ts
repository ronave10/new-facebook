"use client";

import type {
  AuthSession,
  BrandProfileInput,
  CreateClientInput,
  DashboardOverview,
} from "@campaignos/shared";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

const ACCESS_KEY = "campaignos.accessToken";
const REFRESH_KEY = "campaignos.refreshToken";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

function getAccess(): string | null {
  return typeof window === "undefined" ? null : localStorage.getItem(ACCESS_KEY);
}
function getRefresh(): string | null {
  return typeof window === "undefined" ? null : localStorage.getItem(REFRESH_KEY);
}
export function setTokens(access: string, refresh: string) {
  localStorage.setItem(ACCESS_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
}
export function clearTokens() {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

async function rawRequest<T>(path: string, init: RequestInit, retry = true): Promise<T> {
  const access = getAccess();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string>),
  };
  if (access) headers.Authorization = `Bearer ${access}`;

  const res = await fetch(`${BASE}${path}`, { ...init, headers });

  if (res.status === 401 && retry && getRefresh() && !path.startsWith("/auth/")) {
    const refreshed = await tryRefresh();
    if (refreshed) return rawRequest<T>(path, init, false);
    clearTokens();
    if (typeof window !== "undefined") window.location.href = "/login";
    throw new ApiError(401, "נדרשת התחברות מחדש", "UNAUTHORIZED");
  }

  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new ApiError(res.status, body?.message ?? "אירעה שגיאה", body?.code, body?.details);
  }
  return body as T;
}

async function tryRefresh(): Promise<boolean> {
  const refreshToken = getRefresh();
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return false;
    const session = (await res.json()) as AuthSession;
    setTokens(session.accessToken, session.refreshToken);
    return true;
  } catch {
    return false;
  }
}

const get = <T>(path: string) => rawRequest<T>(path, { method: "GET" });
const post = <T>(path: string, body?: unknown) =>
  rawRequest<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined });
const put = <T>(path: string, body?: unknown) =>
  rawRequest<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined });
const del = <T>(path: string) => rawRequest<T>(path, { method: "DELETE" });

export const api = {
  // auth
  register: (b: { email: string; password: string; name: string; organizationName: string }) =>
    post<AuthSession>("/auth/register", b),
  login: (b: { email: string; password: string }) => post<AuthSession>("/auth/login", b),
  logout: (refreshToken: string) => post("/auth/logout", { refreshToken }),
  me: () => get<{ user: { id: string; email: string; name: string }; organizationId: string; organizationName: string; role: string }>("/auth/me"),

  // org + members
  getOrg: () => get<any>("/org"),
  updateOrg: (name: string) => put<any>("/org", { name }),
  members: () => get<any[]>("/org/members"),
  addMember: (b: any) => post<any>("/org/members", b),
  updateMember: (id: string, b: any) => put<any>(`/org/members/${id}`, b),
  removeMember: (id: string) => del<any>(`/org/members/${id}`),
  auditLogs: (page = 1, action?: string) =>
    get<any>(`/audit-logs?page=${page}${action ? `&action=${encodeURIComponent(action)}` : ""}`),

  // clients
  clients: (page = 1, search?: string) =>
    get<any>(`/clients?page=${page}${search ? `&search=${encodeURIComponent(search)}` : ""}`),
  client: (id: string) => get<any>(`/clients/${id}`),
  createClient: (b: CreateClientInput) => post<any>("/clients", b),
  updateClient: (id: string, b: Partial<CreateClientInput>) => put<any>(`/clients/${id}`, b),
  archiveClient: (id: string) => del<any>(`/clients/${id}`),
  saveBrandProfile: (id: string, b: BrandProfileInput) => put<any>(`/clients/${id}/brand-profile`, b),

  // personas
  personas: (clientId: string) => get<any[]>(`/clients/${clientId}/personas`),
  generatePersonas: (clientId: string, count = 4) =>
    post<any[]>(`/clients/${clientId}/personas/generate`, { count }),
  deletePersona: (id: string) => del<any>(`/personas/${id}`),

  // meta
  metaConnections: (clientId?: string) =>
    get<any[]>(`/meta/connections${clientId ? `?clientId=${clientId}` : ""}`),
  metaConnectStart: (clientId?: string) => post<any>("/meta/connect/start", { clientId }),
  metaAdAccounts: (connectionId: string) => get<any[]>(`/meta/ad-accounts?connectionId=${connectionId}`),
  metaSelectAdAccount: (adAccountId: string, clientId: string) =>
    post<any>("/meta/ad-accounts/select", { adAccountId, clientId }),
  metaDisconnect: (id: string) => del<any>(`/meta/connections/${id}`),
  metaRefresh: (id: string) => post<any>(`/meta/connections/${id}/refresh`),
  metaSync: (clientId: string) => post<any>(`/meta/sync/${clientId}`),

  // campaigns
  campaigns: (clientId?: string, status?: string, page = 1) =>
    get<any>(`/campaigns?page=${page}${clientId ? `&clientId=${clientId}` : ""}${status ? `&status=${status}` : ""}`),
  campaign: (id: string) => get<any>(`/campaigns/${id}`),
  createCampaignDraft: (b: any) => post<any>("/campaigns/draft", b),
  updateCampaign: (id: string, b: any) => put<any>(`/campaigns/${id}`, b),
  deleteCampaign: (id: string) => del<any>(`/campaigns/${id}`),
  generateStrategy: (id: string) => post<any>(`/campaigns/${id}/generate-strategy`),
  generateAds: (id: string, personaIds: string[] = [], variantCount = 6) =>
    post<any>(`/campaigns/${id}/generate-ads`, { personaIds, variantCount }),
  requestApproval: (id: string) => post<any>(`/campaigns/${id}/request-approval`),
  publish: (id: string) => post<any>(`/campaigns/${id}/publish`),
  pauseCampaign: (id: string) => post<any>(`/campaigns/${id}/pause`),

  // approvals
  approvals: (status?: string) => get<any[]>(`/approvals${status ? `?status=${status}` : ""}`),
  approve: (id: string, reason?: string) => post<any>(`/approvals/${id}/approve`, { reason }),
  reject: (id: string, reason?: string) => post<any>(`/approvals/${id}/reject`, { reason }),

  // analytics + recommendations
  analytics: (clientId: string, datePreset = "last_30d") =>
    get<DashboardOverview>(`/analytics/client/${clientId}?datePreset=${datePreset}`),
  timeseries: (campaignId: string, granularity = "DAY") =>
    get<any[]>(`/analytics/campaign/${campaignId}/timeseries?granularity=${granularity}`),
  accountAudit: (clientId: string) => get<any>(`/analytics/client/${clientId}/audit`),
  recommendations: (clientId?: string, status?: string) =>
    get<any[]>(`/recommendations${clientId ? `?clientId=${clientId}` : ""}${status ? `${clientId ? "&" : "?"}status=${status}` : ""}`),
  generateRecommendations: (clientId: string) => post<any[]>("/recommendations/generate", { clientId }),
  decideRecommendation: (id: string, decision: string) =>
    post<any>(`/recommendations/${id}/decide`, { decision }),
  applyRecommendation: (id: string) => post<any>(`/recommendations/${id}/apply`),

  // custom audiences
  audiences: (clientId: string) => get<any[]>(`/clients/${clientId}/audiences`),
  syncAudiences: (clientId: string) => post<any[]>(`/clients/${clientId}/audiences/sync`),
  createAudience: (clientId: string, b: { name: string; subtype: string; originAudienceId?: string; ratio?: number }) =>
    post<any>(`/clients/${clientId}/audiences`, b),
  deleteAudience: (id: string) => del<any>(`/audiences/${id}`),

  // leads
  leads: (clientId: string, status?: string) =>
    get<any[]>(`/clients/${clientId}/leads${status ? `?status=${status}` : ""}`),
  simulateLead: (clientId: string) => post<any>(`/clients/${clientId}/leads/simulate`),
  updateLeadStatus: (leadId: string, status: string, notes?: string) =>
    put<any>(`/leads/${leadId}/status`, { status, notes }),

  // creative assets
  assets: (clientId: string) => get<any[]>(`/clients/${clientId}/assets`),
  uploadAsset: (clientId: string, b: { fileName: string; mimeType: string; kind: "IMAGE" | "VIDEO"; dataBase64: string }) =>
    post<any>(`/clients/${clientId}/assets`, b),
  attachAsset: (creativeId: string, assetId: string) =>
    post<any>(`/creatives/${creativeId}/attach-asset`, { assetId }),

  // agent runs
  agentRuns: (clientId?: string, agentType?: string) =>
    get<any>(`/agent-runs?${clientId ? `clientId=${clientId}&` : ""}${agentType ? `agentType=${agentType}` : ""}`),
};
