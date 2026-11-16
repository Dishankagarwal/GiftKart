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
  gifts: RegistryGift[];
  categories: string[];
};

export type RegistryGift = {
  id: string;
  category: string;
  name: string;
  description: string;
  price: number;
  link: string;
  priority: number;
};

export type RegistryManagementActivity = {
  id: string;
  kind: "reservation" | "contribution";
  giftId: string;
  guestName: string;
  email: string | null;
  phone: string | null;
  amount: number | null;
  status: "reserved" | "pledged" | "payment_reported";
  createdAt: string;
  paymentReportedAt: string | null;
  expiresAt: string | null;
};

export type RegistryPaymentSettings = {
  recipients: RegistryPaymentRecipient[];
  bankAccountName: string;
  bankAccountNumber: string;
  bankIfsc: string;
  cashInstructions: string;
  generalInstructions: string;
};

export type RegistryPaymentRecipient = {
  id: string;
  displayName: string;
  upiId: string;
  qrImagePath: string | null;
  qrImageUrl: string | null;
  qrImageFile?: File | null;
};

const emptyRegistryPaymentSettings: RegistryPaymentSettings = {
  recipients: [],
  bankAccountName: "",
  bankAccountNumber: "",
  bankIfsc: "",
  cashInstructions: "",
  generalInstructions: "",
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

function encodeStoragePath(value: string): string {
  return value.split("/").map(encodeURIComponent).join("/");
}

type PaymentRecipientRow = {
  id: string;
  display_name: string;
  upi_id: string;
  qr_image_path: string | null;
  sort_order: number;
};

async function getPaymentQrSignedUrl(
  storagePath: string,
  session: SupabaseSession | null,
): Promise<{ url: string; session: SupabaseSession | null }> {
  const path = `/storage/v1/object/sign/payment-qrs/${encodeStoragePath(storagePath)}`;
  const request = session
    ? await authenticatedFetch(path, session, {
      method: "POST",
      body: JSON.stringify({ expiresIn: 600 }),
    })
    : {
      response: await fetch(`${supabaseUrl}${path}`, {
        method: "POST",
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${supabaseAnonKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ expiresIn: 600 }),
      }),
      session: null,
    };
  const result = await parseResponse<{ signedURL: string }>(request.response);
  return {
    url: new URL(`/storage/v1${result.signedURL}`, supabaseUrl).href,
    session: request.session,
  };
}

async function attachPaymentQrUrls(
  recipients: RegistryPaymentRecipient[],
  session: SupabaseSession | null,
): Promise<{ recipients: RegistryPaymentRecipient[]; session: SupabaseSession | null }> {
  let currentSession = session;
  const withUrls: RegistryPaymentRecipient[] = [];
  for (const recipient of recipients) {
    if (!recipient.qrImagePath) {
      withUrls.push({ ...recipient, qrImageUrl: null });
      continue;
    }
    const result = await getPaymentQrSignedUrl(recipient.qrImagePath, currentSession);
    currentSession = result.session;
    withUrls.push({ ...recipient, qrImageUrl: result.url });
  }
  return { recipients: withUrls, session: currentSession };
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
    gifts: [],
    categories: [],
  };
}

type GiftCategoryRow = {
  id: string;
  name: string;
  sort_order: number;
};

type GiftRow = {
  id: string;
  category_id: string | null;
  name: string;
  description: string;
  target_amount: number;
  external_url: string | null;
  sort_order: number;
};

async function getRegistryWishlist(
  session: SupabaseSession,
  registryId: string,
): Promise<{
  gifts: RegistryGift[];
  categories: string[];
  session: SupabaseSession;
}> {
  const categoriesResult = await authenticatedFetch(
    `/rest/v1/gift_categories?select=id,name,sort_order&registry_id=eq.${encodeQuery(registryId)}&order=sort_order.asc,name.asc`,
    session,
  );
  const categoryRows = await parseResponse<GiftCategoryRow[]>(categoriesResult.response);
  const giftsResult = await authenticatedFetch(
    `/rest/v1/gifts?select=id,category_id,name,description,target_amount,external_url,sort_order&registry_id=eq.${encodeQuery(registryId)}&is_active=eq.true&order=sort_order.asc,created_at.asc,id.asc`,
    categoriesResult.session,
  );
  const giftRows = await parseResponse<GiftRow[]>(giftsResult.response);
  const categoriesById = new Map(categoryRows.map((category) => [category.id, category.name]));
  return {
    gifts: giftRows.map((gift, index) => ({
      id: gift.id,
      category: gift.category_id ? categoriesById.get(gift.category_id) ?? "A little something" : "A little something",
      name: gift.name,
      description: gift.description,
      price: Number(gift.target_amount),
      link: gift.external_url ?? "",
      priority: index + 1,
    })),
    categories: categoryRows.map((category) => category.name),
    session: giftsResult.session,
  };
}

export async function getOwnedRegistry(
  session: SupabaseSession,
): Promise<{ registry: RegistryDetails | null; session: SupabaseSession }> {
  const path = `/rest/v1/registries?select=id,owner_id,couple_names,wedding_date,city,welcome_message,public_slug,is_published&owner_id=eq.${encodeQuery(session.user.id)}&limit=1`;
  const { response, session: currentSession } = await authenticatedFetch(path, session);
  const rows = await parseResponse<RegistryRow[]>(response);
  if (!rows[0]) return { registry: null, session: currentSession };
  const wishlist = await getRegistryWishlist(currentSession, rows[0].id);
  const registry = mapRegistry(rows[0], wishlist.session.user.email);
  registry.gifts = wishlist.gifts;
  registry.categories = wishlist.categories;
  return {
    registry,
    session: wishlist.session,
  };
}

export async function saveRegistry(
  session: SupabaseSession,
  details: Omit<RegistryDetails, "id" | "ownerId" | "ownerEmail" | "isPublished" | "gifts" | "categories">,
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

type PaymentSettingsRow = {
  bank_account_name: string | null;
  bank_account_number: string | null;
  bank_ifsc: string | null;
  cash_instructions: string | null;
  general_instructions: string;
};

function mapPaymentSettings(row?: PaymentSettingsRow): RegistryPaymentSettings {
  if (!row) return { ...emptyRegistryPaymentSettings };
  return {
    recipients: [],
    bankAccountName: row.bank_account_name ?? "",
    bankAccountNumber: row.bank_account_number ?? "",
    bankIfsc: row.bank_ifsc ?? "",
    cashInstructions: row.cash_instructions ?? "",
    generalInstructions: row.general_instructions ?? "",
  };
}

export async function getRegistryPaymentSettings(
  session: SupabaseSession,
  registryId: string,
): Promise<{ settings: RegistryPaymentSettings; session: SupabaseSession }> {
  const { response, session: currentSession } = await authenticatedFetch(
    `/rest/v1/payment_settings?select=bank_account_name,bank_account_number,bank_ifsc,cash_instructions,general_instructions&registry_id=eq.${encodeQuery(registryId)}&limit=1`,
    session,
  );
  const rows = await parseResponse<PaymentSettingsRow[]>(response);
  const recipientsResult = await authenticatedFetch(
    `/rest/v1/registry_payment_recipients?select=id,display_name,upi_id,qr_image_path,sort_order&registry_id=eq.${encodeQuery(registryId)}&order=sort_order.asc,created_at.asc,id.asc`,
    currentSession,
  );
  const recipientRows = await parseResponse<PaymentRecipientRow[]>(recipientsResult.response);
  const signedRecipients = await attachPaymentQrUrls(
    recipientRows.map((row) => ({
      id: row.id,
      displayName: row.display_name,
      upiId: row.upi_id,
      qrImagePath: row.qr_image_path,
      qrImageUrl: null,
    })),
    recipientsResult.session,
  );
  return {
    settings: { ...mapPaymentSettings(rows[0]), recipients: signedRecipients.recipients },
    session: signedRecipients.session ?? currentSession,
  };
}

export async function saveRegistryPaymentSettings(
  session: SupabaseSession,
  registryId: string,
  settings: RegistryPaymentSettings,
): Promise<{ settings: RegistryPaymentSettings; session: SupabaseSession }> {
  const previous = await getRegistryPaymentSettings(session, registryId);
  let currentSession = previous.session;
  const previousPaths = new Set(previous.settings.recipients.flatMap((recipient) =>
    recipient.qrImagePath ? [recipient.qrImagePath] : []
  ));
  const uploadedPaths: string[] = [];
  const recipients: RegistryPaymentRecipient[] = [];
  let savedSession = currentSession;
  try {
    for (const recipient of settings.recipients) {
      let qrImagePath = recipient.qrImagePath;
      if (recipient.qrImageFile) {
        const extension = recipient.qrImageFile.type === "image/jpeg" ? "jpg" :
          recipient.qrImageFile.type === "image/png" ? "png" :
          recipient.qrImageFile.type === "image/webp" ? "webp" : null;
        if (!extension || recipient.qrImageFile.size > 5 * 1024 * 1024) {
          throw new Error("Choose a JPEG, PNG, or WebP QR image no larger than 5 MB.");
        }
        qrImagePath = `${registryId}/${recipient.id}-${crypto.randomUUID()}.${extension}`;
        const upload = await authenticatedFetch(
          `/storage/v1/object/payment-qrs/${encodeStoragePath(qrImagePath)}`,
          currentSession,
          {
            method: "POST",
            headers: { "Content-Type": recipient.qrImageFile.type, "x-upsert": "false" },
            body: recipient.qrImageFile,
          },
        );
        currentSession = upload.session;
        await parseResponse<unknown>(upload.response);
        uploadedPaths.push(qrImagePath);
      }
      recipients.push({
        id: recipient.id,
        displayName: recipient.displayName.trim(),
        upiId: recipient.upiId.trim(),
        qrImagePath,
        qrImageUrl: null,
      });
    }

    const saved = await authenticatedFetch(
      "/rest/v1/rpc/save_registry_payment_settings",
      currentSession,
      {
        method: "POST",
        body: JSON.stringify({
          p_registry_id: registryId,
          p_settings: {
            bank_account_name: settings.bankAccountName.trim() || null,
            bank_account_number: settings.bankAccountNumber.trim() || null,
            bank_ifsc: settings.bankIfsc.trim().toUpperCase() || null,
            cash_instructions: settings.cashInstructions.trim() || null,
            general_instructions: settings.generalInstructions.trim(),
          },
          p_recipients: recipients.map((recipient) => ({
            id: recipient.id,
            display_name: recipient.displayName,
            upi_id: recipient.upiId,
            qr_image_path: recipient.qrImagePath,
          })),
        }),
      },
    );
    currentSession = saved.session;
    savedSession = saved.session;
    await parseResponse<null>(saved.response);
  } catch (error) {
    if (uploadedPaths.length) {
      try {
        await removePaymentQrImages(currentSession, uploadedPaths);
      } catch (cleanupError) {
        console.error("Could not remove newly uploaded QR images after saving failed", cleanupError);
        throw new Error(`${error instanceof Error ? error.message : "Could not save payment instructions."} Newly uploaded QR images could not be cleaned up.`);
      }
    }
    throw error;
  }

  const retainedPaths = new Set(recipients.flatMap((recipient) => recipient.qrImagePath ? [recipient.qrImagePath] : []));
  const removedPaths = [...previousPaths].filter((path) => !retainedPaths.has(path));
  if (removedPaths.length) {
    await removePaymentQrImages(savedSession, removedPaths);
  }
  const result = await getRegistryPaymentSettings(savedSession, registryId);
  return { settings: result.settings, session: result.session };
}

async function removePaymentQrImages(session: SupabaseSession, paths: string[]): Promise<void> {
  const { response } = await authenticatedFetch("/storage/v1/object/payment-qrs", session, {
    method: "DELETE",
    body: JSON.stringify({ prefixes: [...new Set(paths)] }),
  });
  await parseResponse<unknown>(response);
}

export async function saveRegistryGift(
  session: SupabaseSession,
  registryId: string,
  gift: RegistryGift,
  orderedGiftIds: string[],
): Promise<SupabaseSession> {
  const { response, session: currentSession } = await authenticatedFetch(
    "/rest/v1/rpc/save_registry_gift",
    session,
    {
      method: "POST",
      body: JSON.stringify({
        p_registry_id: registryId,
        p_gift_id: gift.id,
        p_name: gift.name,
        p_description: gift.description,
        p_target_amount: gift.price,
        p_external_url: gift.link || null,
        p_category_name: gift.category,
        p_gift_ids: orderedGiftIds,
      }),
    },
  );
  await parseResponse<string>(response);
  return currentSession;
}

export async function reorderRegistryGifts(
  session: SupabaseSession,
  registryId: string,
  orderedGiftIds: string[],
): Promise<SupabaseSession> {
  const { response, session: currentSession } = await authenticatedFetch(
    "/rest/v1/rpc/reorder_registry_gifts",
    session,
    {
      method: "POST",
      body: JSON.stringify({
        p_registry_id: registryId,
        p_gift_ids: orderedGiftIds,
      }),
    },
  );
  await parseResponse<null>(response);
  return currentSession;
}

type GuestRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
};

type ReservationActivityRow = {
  id: string;
  gift_id: string;
  guest_id: string;
  status: "reserved";
  created_at: string;
};

type ContributionActivityRow = {
  id: string;
  gift_id: string;
  guest_id: string;
  amount: number;
  status: "pledged" | "payment_reported";
  created_at: string;
  payment_reported_at: string | null;
  expires_at: string | null;
};

export async function getRegistryManagementActivities(
  session: SupabaseSession,
  registryId: string,
): Promise<{ activities: RegistryManagementActivity[]; session: SupabaseSession }> {
  const reservationsResult = await authenticatedFetch(
    `/rest/v1/reservations?select=id,gift_id,guest_id,status,created_at&registry_id=eq.${encodeQuery(registryId)}&status=eq.reserved&order=created_at.desc,id.asc`,
    session,
  );
  const reservations = await parseResponse<ReservationActivityRow[]>(reservationsResult.response);
  const contributionsResult = await authenticatedFetch(
    `/rest/v1/contributions?select=id,gift_id,guest_id,amount,status,created_at,payment_reported_at,expires_at&registry_id=eq.${encodeQuery(registryId)}&status=in.(pledged,payment_reported)&order=created_at.desc,id.asc`,
    reservationsResult.session,
  );
  const contributions = await parseResponse<ContributionActivityRow[]>(contributionsResult.response);
  const guestIds = [...new Set([
    ...reservations.map((item) => item.guest_id),
    ...contributions.map((item) => item.guest_id),
  ])];
  if (guestIds.length === 0) {
    return { activities: [], session: contributionsResult.session };
  }
  const guestsResult = await authenticatedFetch(
    `/rest/v1/guests?select=id,name,email,phone&registry_id=eq.${encodeQuery(registryId)}&id=in.(${guestIds.map(encodeQuery).join(",")})`,
    contributionsResult.session,
  );
  const guests = await parseResponse<GuestRow[]>(guestsResult.response);
  const guestsById = new Map(guests.map((guest) => [guest.id, guest]));
  const activities = [
    ...reservations.map((row): RegistryManagementActivity => {
      const guest = guestsById.get(row.guest_id);
      if (!guest) throw new Error("A reservation's guest details could not be loaded. Refresh and try again.");
      return {
        id: row.id,
        kind: "reservation",
        giftId: row.gift_id,
        guestName: guest.name,
        email: guest.email,
        phone: guest.phone,
        amount: null,
        status: row.status,
        createdAt: row.created_at,
        paymentReportedAt: null,
        expiresAt: null,
      };
    }),
    ...contributions.map((row): RegistryManagementActivity => {
      const guest = guestsById.get(row.guest_id);
      if (!guest) throw new Error("A contribution's guest details could not be loaded. Refresh and try again.");
      return {
        id: row.id,
        kind: "contribution",
        giftId: row.gift_id,
        guestName: guest.name,
        email: guest.email,
        phone: guest.phone,
        amount: Number(row.amount),
        status: row.status,
        createdAt: row.created_at,
        paymentReportedAt: row.payment_reported_at,
        expiresAt: row.expires_at,
      };
    }),
  ];
  return { activities, session: guestsResult.session };
}

async function callMemberActivityRpc(
  session: SupabaseSession,
  functionName: string,
  body: Record<string, unknown>,
  unavailableMessage: string,
): Promise<SupabaseSession> {
  const { response, session: currentSession } = await authenticatedFetch(
    `/rest/v1/rpc/${functionName}`,
    session,
    { method: "POST", body: JSON.stringify(body) },
  );
  const completed = await parseResponse<boolean>(response);
  if (!completed) throw new Error(unavailableMessage);
  return currentSession;
}

export async function releaseRegistryReservation(
  session: SupabaseSession,
  reservationId: string,
): Promise<SupabaseSession> {
  return callMemberActivityRpc(session, "release_reservation", {
    p_reservation_id: reservationId,
  }, "This reservation is no longer active. Refresh the activity list.");
}

export async function releaseRegistryPledge(
  session: SupabaseSession,
  contributionId: string,
): Promise<SupabaseSession> {
  return callMemberActivityRpc(session, "release_unpaid_pledge", {
    p_contribution_id: contributionId,
  }, "This unpaid pledge is no longer active. Refresh the activity list.");
}

export async function reviewRegistryContribution(
  session: SupabaseSession,
  contributionId: string,
  decision: "verified" | "rejected",
  rejectionReason = "",
): Promise<SupabaseSession> {
  return callMemberActivityRpc(session, "review_contribution", {
    p_contribution_id: contributionId,
    p_decision: decision,
    p_rejection_reason: rejectionReason.trim() || null,
  }, "This payment report has already changed. Refresh the activity list.");
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
    committed_amount: number;
    verified_amount: number;
    is_reserved: boolean;
  }>;
  payment_instructions: {
    payment_recipients: Array<{
      id: string;
      display_name: string;
      upi_id: string;
      qr_image_path: string | null;
      qr_image_url?: string | null;
    }>;
    bank_account_name: string | null;
    bank_account_number: string | null;
    bank_ifsc: string | null;
    cash_instructions: string | null;
    general_instructions: string | null;
  } | null;
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
  if (!result?.payment_instructions) return result;
  const recipients = await attachPaymentQrUrls(
    result.payment_instructions.payment_recipients.map((recipient) => ({
      id: recipient.id,
      displayName: recipient.display_name,
      upiId: recipient.upi_id,
      qrImagePath: recipient.qr_image_path,
      qrImageUrl: null,
    })),
    null,
  );
  return {
    ...result,
    payment_instructions: {
      ...result.payment_instructions,
      payment_recipients: recipients.recipients.map((recipient) => ({
        id: recipient.id,
        display_name: recipient.displayName,
        upi_id: recipient.upiId,
        qr_image_path: recipient.qrImagePath,
        qr_image_url: recipient.qrImageUrl,
      })),
    },
  };
}

export type GuestContact = {
  email?: string;
  phone?: string;
};

export type GuestActivityDetails = {
  kind: "reservation" | "contribution";
  status: "reserved" | "cancelled" | "released" | "pledged" | "payment_reported" | "verified" | "rejected" | "expired";
  giftName: string;
  coupleNames: string;
  amount: number | null;
  expiresAt: string | null;
  createdAt: string;
};

type GuestActivityResponse = {
  kind: GuestActivityDetails["kind"];
  status: GuestActivityDetails["status"];
  gift_name: string;
  couple_names: string;
  amount?: number | string;
  expires_at?: string | null;
  created_at: string;
};

type GuestCreationResponse = {
  guest_token: string;
};

async function guestFunctionRequest<T>(
  endpoint: string,
  body: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(`${supabaseUrl}/functions/v1/${endpoint}`, {
    method: "POST",
    headers: {
      apikey: supabaseAnonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return parseResponse<T>(response);
}

function guestContactFields(contact: string): GuestContact {
  return contact.includes("@")
    ? { email: contact.trim() }
    : { phone: contact.trim() };
}

export async function createGuestReservation(
  giftId: string,
  guestName: string,
  contact: string,
): Promise<GuestCreationResponse> {
  const result = await guestFunctionRequest<GuestCreationResponse>("create-reservation", {
    giftId,
    guestName,
    ...guestContactFields(contact),
  });
  if (!/^[0-9a-f]{64}$/i.test(result.guest_token ?? "")) {
    throw new Error("The reservation was created, but its private status link could not be issued. Contact the couple before retrying.");
  }
  return result;
}

export async function createGuestPledge(
  giftId: string,
  amount: number,
  guestName: string,
  contact: string,
): Promise<GuestCreationResponse> {
  const result = await guestFunctionRequest<GuestCreationResponse>("create-group-pledge", {
    giftId,
    amount,
    guestName,
    ...guestContactFields(contact),
  });
  if (!/^[0-9a-f]{64}$/i.test(result.guest_token ?? "")) {
    throw new Error("The contribution was created, but its private status link could not be issued. Contact the couple before retrying.");
  }
  return result;
}

export async function getGuestActivity(token: string): Promise<GuestActivityDetails> {
  const activity = await guestFunctionRequest<GuestActivityResponse>("guest-activity", { token });
  if (
    (activity.kind !== "reservation" && activity.kind !== "contribution") ||
    !["reserved", "cancelled", "released", "pledged", "payment_reported", "verified", "rejected", "expired"].includes(activity.status) ||
    typeof activity.gift_name !== "string" ||
    typeof activity.couple_names !== "string" ||
    typeof activity.created_at !== "string"
  ) {
    throw new Error("The guest status response is incomplete. Please reopen your private link.");
  }
  const amount = activity.amount === undefined ? null : Number(activity.amount);
  if (amount !== null && !Number.isFinite(amount)) {
    throw new Error("The guest status response contains an invalid amount.");
  }
  return {
    kind: activity.kind,
    status: activity.status,
    giftName: activity.gift_name,
    coupleNames: activity.couple_names,
    amount,
    expiresAt: activity.expires_at ?? null,
    createdAt: activity.created_at,
  };
}

export async function cancelGuestReservation(token: string): Promise<void> {
  await guestFunctionRequest<{ status: string }>("cancel-reservation", { token });
}

export async function reportGuestPayment(token: string): Promise<void> {
  await guestFunctionRequest<{ status: string }>("report-payment", { token });
}
