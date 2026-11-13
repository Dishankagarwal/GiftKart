export type SupabaseUser = {
  id: string;
  email: string;
};

export type SupabaseSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: SupabaseUser;
};

export type RegistryDetails = {
  id: string;
  slug: string;
  ownerId: string;
  ownerEmail: string;
  firstName: string;
  partnerName: string;
  weddingDate: string;
  city: string;
  welcomeMessage: string;
  isPublished: boolean;
};

type AuthResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  expires_at?: number;
  user?: SupabaseUser;
};

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.replace(/\/+$/, "") ?? "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";
const sessionStorageKey = "shaadiledger.supabase.session.v1";
let refreshInFlight: Promise<SupabaseSession> | null = null;

function validateConfiguration(): string | null {
  if (!supabaseUrl && !supabaseAnonKey) return null;
  if (!supabaseUrl || !supabaseAnonKey) {
    return "Supabase configuration is incomplete. Set both VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local.";
  }
  try {
    const url = new URL(supabaseUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return "VITE_SUPABASE_URL must use HTTPS (or HTTP for local development).";
    }
  } catch {
    return "VITE_SUPABASE_URL is not a valid URL.";
  }
  return null;
}

export const supabaseConfigurationError = validateConfiguration();
export const isSupabaseConfigured = !supabaseConfigurationError && Boolean(supabaseUrl && supabaseAnonKey);

function getErrorMessage(payload: unknown, fallback: string): string {
  if (typeof payload === "object" && payload !== null) {
    const error = payload as Record<string, unknown>;
    for (const key of ["message", "msg", "error_description", "error"]) {
      if (typeof error[key] === "string" && error[key]) return error[key];
    }
  }
  return fallback;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(getErrorMessage(payload, `Supabase request failed (${response.status}).`));
  }
  return payload as T;
}

function toSession(payload: AuthResponse): SupabaseSession {
  if (!payload.access_token || !payload.refresh_token || !payload.user?.id || !payload.user.email) {
    throw new Error("Supabase did not return a complete authenticated session.");
  }
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresAt: payload.expires_at ?? Math.floor(Date.now() / 1000) + (payload.expires_in ?? 3600),
    user: { id: payload.user.id, email: payload.user.email },
  };
}

function saveSession(session: SupabaseSession): void {
  try {
    window.localStorage.setItem(sessionStorageKey, JSON.stringify(session));
  } catch (error) {
    console.error("Could not save the Supabase session in this browser", error);
    throw new Error("Your session could not be saved in this browser. Check storage permissions and try again.");
  }
}

function clearSession(): void {
  window.localStorage.removeItem(sessionStorageKey);
}

async function authRequest(path: string, body: Record<string, unknown>): Promise<AuthResponse> {
  const response = await fetch(`${supabaseUrl}/auth/v1/${path}`, {
    method: "POST",
    headers: {
      apikey: supabaseAnonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return parseResponse<AuthResponse>(response);
}

export async function signUp(email: string, password: string): Promise<SupabaseSession | null> {
  const payload = await authRequest("signup", { email, password });
  if (!payload.access_token) return null;
  const session = toSession(payload);
  saveSession(session);
  return session;
}

export async function signIn(email: string, password: string): Promise<SupabaseSession> {
  const payload = await authRequest("token?grant_type=password", { email, password });
  const session = toSession(payload);
  saveSession(session);
  return session;
}

function refreshSession(session: SupabaseSession): Promise<SupabaseSession> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const payload = await authRequest("token?grant_type=refresh_token", {
        refresh_token: session.refreshToken,
      });
      const refreshed = toSession(payload);
      saveSession(refreshed);
      return refreshed;
    })().finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
}

export async function restoreSession(): Promise<SupabaseSession | null> {
  const saved = window.localStorage.getItem(sessionStorageKey);
  if (!saved) return null;
  let session: SupabaseSession;
  try {
    session = JSON.parse(saved) as SupabaseSession;
    if (!session.refreshToken || !session.user?.id || !session.user.email) {
      throw new Error("Saved Supabase session is incomplete.");
    }
  } catch (error) {
    clearSession();
    console.error("Could not restore the saved Supabase session", error);
    throw new Error("Your saved session is invalid. Please sign in again.");
  }
  return session;
}

export async function signOut(session: SupabaseSession | null): Promise<void> {
  try {
    if (session) {
      const currentSession = session.expiresAt <= Math.floor(Date.now() / 1000) + 30
        ? await refreshSession(session)
        : session;
      const response = await fetch(`${supabaseUrl}/auth/v1/logout`, {
        method: "POST",
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${currentSession.accessToken}`,
        },
      });
      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => null);
        throw new Error(getErrorMessage(payload, `Supabase sign out failed (${response.status}).`));
      }
    }
  } finally {
    clearSession();
  }
}

async function authenticatedFetch(
  path: string,
  session: SupabaseSession,
  init: RequestInit = {},
): Promise<{ response: Response; session: SupabaseSession }> {
  let currentSession = session;
  if (currentSession.expiresAt <= Math.floor(Date.now() / 1000) + 30) {
    currentSession = await refreshSession(currentSession);
  }
  const makeRequest = (accessToken: string) => {
    const headers = new Headers(init.headers);
    headers.set("apikey", supabaseAnonKey);
    headers.set("Authorization", `Bearer ${accessToken}`);
    if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    return fetch(`${supabaseUrl}${path}`, { ...init, headers });
  };
  let response = await makeRequest(currentSession.accessToken);
  if (response.status === 401) {
    currentSession = await refreshSession(currentSession);
    response = await makeRequest(currentSession.accessToken);
  }
  return { response, session: currentSession };
}

function encodeQuery(value: string): string {
  return encodeURIComponent(value);
}

function splitCoupleNames(value: string): [string, string] {
  const separator = value.indexOf(" & ");
  if (separator < 0) return [value, ""];
  return [value.slice(0, separator), value.slice(separator + 3)];
}

type RegistryRow = {
  id: string;
  owner_id: string;
  couple_names: string;
  wedding_date: string | null;
  city: string | null;
  welcome_message: string;
  public_slug: string;
  is_published: boolean;
};

function mapRegistry(row: RegistryRow, ownerEmail: string): RegistryDetails {
  const [firstName, partnerName] = splitCoupleNames(row.couple_names);
  return {
    id: row.id,
    slug: row.public_slug,
    ownerId: row.owner_id,
    ownerEmail,
    firstName,
    partnerName,
    weddingDate: row.wedding_date ?? "",
    city: row.city ?? "",
    welcomeMessage: row.welcome_message,
    isPublished: row.is_published,
  };
}

export async function getOwnedRegistry(
  session: SupabaseSession,
): Promise<{ registry: RegistryDetails | null; session: SupabaseSession }> {
  const path = `/rest/v1/registries?select=id,owner_id,couple_names,wedding_date,city,welcome_message,public_slug,is_published&owner_id=eq.${encodeQuery(session.user.id)}&limit=1`;
  const { response, session: currentSession } = await authenticatedFetch(path, session);
  const rows = await parseResponse<RegistryRow[]>(response);
  return {
    registry: rows[0] ? mapRegistry(rows[0], currentSession.user.email) : null,
    session: currentSession,
  };
}

export async function saveRegistry(
  session: SupabaseSession,
  details: Omit<RegistryDetails, "id" | "ownerId" | "ownerEmail" | "isPublished">,
  existing: RegistryDetails | null,
): Promise<{ registry: RegistryDetails; session: SupabaseSession }> {
  const row = {
    couple_names: `${details.firstName} & ${details.partnerName}`,
    wedding_date: details.weddingDate || null,
    city: details.city || null,
    welcome_message: details.welcomeMessage,
    public_slug: details.slug,
  };
  const path = existing
    ? `/rest/v1/registries?id=eq.${encodeQuery(existing.id)}`
    : "/rest/v1/registries";
  const { response, session: currentSession } = await authenticatedFetch(path, session, {
    method: existing ? "PATCH" : "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(existing ? row : { ...row, owner_id: session.user.id }),
  });
  const rows = await parseResponse<RegistryRow[]>(response);
  if (!rows[0]) throw new Error("Supabase saved the registry but did not return its details.");
  return {
    registry: mapRegistry(rows[0], currentSession.user.email),
    session: currentSession,
  };
}

export async function updateRegistryPublication(
  session: SupabaseSession,
  registryId: string,
  isPublished: boolean,
): Promise<SupabaseSession> {
  const { response, session: currentSession } = await authenticatedFetch(
    `/rest/v1/registries?id=eq.${encodeQuery(registryId)}`,
    session,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ is_published: isPublished }),
    },
  );
  const rows = await parseResponse<RegistryRow[]>(response);
  if (!rows[0]) throw new Error("The registry could not be updated. Check that you still have access.");
  return currentSession;
}

export type PublicRegistryDetails = {
  id: string;
  couple_names: string;
  wedding_date: string | null;
  city: string | null;
  welcome_message: string;
  public_slug: string;
  gifts: Array<{
    id: string;
    name: string;
    description: string;
    target_amount: number;
    external_url: string | null;
    category: string | null;
  }>;
};

export async function getPublicRegistry(slug: string): Promise<PublicRegistryDetails | null> {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/get_public_registry`, {
    method: "POST",
    headers: {
      apikey: supabaseAnonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_slug: slug }),
  });
  const result = await parseResponse<PublicRegistryDetails | null>(response);
  return result;
}
