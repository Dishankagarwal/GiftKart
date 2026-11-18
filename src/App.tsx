import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  getOwnedRegistry,
  getGuestActivity,
  getPublicRegistry,
  getRegistryManagementActivities,
  getRegistryPaymentSettings,
  isSupabaseConfigured,
  cancelGuestReservation,
  createGuestPledge,
  createGuestReservation,
  releaseRegistryPledge,
  releaseRegistryReservation,
  reorderRegistryGifts,
  reviewRegistryContribution,
  saveRegistryPaymentSettings,
  reportGuestPayment,
  restoreSession,
  saveRegistryGift,
  saveRegistry,
  signIn,
  signOut,
  signUp,
  supabaseConfigurationError,
  updateRegistryPublication,
} from "./services/supabase";
import type {
  GuestActivityDetails,
  PublicRegistryDetails,
  RegistryDetails,
  RegistryManagementActivity,
  RegistryPaymentSettings,
  RegistryPaymentRecipient,
  RegistryGift,
  SupabaseSession,
} from "./services/supabase";

const screens = [
  ["landing", "Landing page"],
  ["login", "Couple sign in"],
  ["create-account", "Couple registration"],
  ["create-registry", "Create registry"],
  ["dashboard", "Couple dashboard"],
  ["edit-gift", "Add / edit gift"],
  ["public-registry", "Public wishlist"],
  ["reserve-gift", "Reserve a gift"],
  ["contribute", "Group contribution"],
  ["guest-status", "Guest status"],
  ["management", "Gift management"],
] as const;

type Screen = (typeof screens)[number][0];

type Gift = {
  id: string;
  category: string;
  emoji: string;
  name: string;
  description: string;
  price: number;
  link: string;
  priority?: number;
  committedAmount?: number;
  verifiedAmount?: number;
  isReserved?: boolean;
};

type Registry = {
  id: string;
  slug: string;
  ownerEmail: string;
  firstName: string;
  partnerName: string;
  weddingDate: string;
  city: string;
  welcomeMessage: string;
  gifts: Gift[];
  categories: string[];
  isPublished?: boolean;
  paymentInstructions?: PublicRegistryDetails["payment_instructions"];
};

type DemoAccount = {
  email: string;
  salt: string;
  passwordHash: string;
};

type GuestActivity = {
  id: string;
  registryId: string;
  giftId: string;
  kind: "reservation" | "contribution";
  guestName: string;
  contact: string;
  amount: number;
  status: "reserved" | "cancelled" | "pledged" | "payment_reported" | "verified" | "rejected" | "expired" | "released";
  giftName?: string;
  coupleNames?: string;
};

type AppData = {
  accounts: DemoAccount[];
  registries: Registry[];
  activities: GuestActivity[];
  sessionEmail: string | null;
};

const STORAGE_KEY = "shaadiledger.demo.v1";

const emptyAppData: AppData = {
  accounts: [],
  registries: [],
  activities: [],
  sessionEmail: null,
};

function toAppRegistry(details: RegistryDetails): Registry {
  return {
    id: details.id,
    slug: details.slug,
    ownerEmail: details.ownerEmail,
    firstName: details.firstName,
    partnerName: details.partnerName,
    weddingDate: details.weddingDate,
    city: details.city,
    welcomeMessage: details.welcomeMessage,
    gifts: details.gifts.map((gift, index) => ({
      ...gift,
      emoji: "♡",
      priority: index + 1,
    })),
    categories: details.categories,
    isPublished: details.isPublished,
  };
}

function toPublicAppRegistry(details: PublicRegistryDetails): Registry {
  const [firstName, partnerName] = details.couple_names.includes(" & ")
    ? [details.couple_names.slice(0, details.couple_names.indexOf(" & ")), details.couple_names.slice(details.couple_names.indexOf(" & ") + 3)]
    : [details.couple_names, ""];
  return {
    id: details.id,
    slug: details.public_slug,
    ownerEmail: "",
    firstName,
    partnerName,
    weddingDate: details.wedding_date ?? "",
    city: details.city ?? "",
    welcomeMessage: details.welcome_message,
    gifts: details.gifts.map((gift, index) => ({
      id: gift.id,
      category: gift.category ?? "A little something",
      emoji: "♡",
      name: gift.name,
      description: gift.description,
      price: Number(gift.target_amount),
      link: gift.external_url ?? "",
      priority: index + 1,
      committedAmount: Number(gift.committed_amount),
      verifiedAmount: Number(gift.verified_amount),
      isReserved: gift.is_reserved,
    })),
    categories: [...new Set(details.gifts.map((gift) => gift.category).filter((category): category is string => Boolean(category)))],
    isPublished: true,
    paymentInstructions: details.payment_instructions,
  };
}

const sampleRegistry: Registry = {
  id: "sample-registry",
  slug: "aarav-priya",
  ownerEmail: "",
  firstName: "Aarav",
  partnerName: "Priya",
  weddingDate: "2027-02-14",
  city: "Jaipur",
  welcomeMessage: "Your love is the best gift. If you'd like to give us something more, we've gathered a few things that feel like home.",
  isPublished: true,
  categories: ["For our home", "Our next adventure", "Something meaningful"],
  gifts: [
  {
    id: "sample-reading-nook",
    category: "For our home",
    emoji: "🪑",
    name: "A little reading nook",
    description: "A cozy chair for slow mornings and long conversations.",
    price: 18500,
    link: "",
    priority: 1,
  },
  {
    id: "sample-dinnerware",
    category: "For our home",
    emoji: "🍽️",
    name: "Dinnerware for two",
    description: "The plates we'll reach for on ordinary, lovely evenings.",
    price: 7200,
    link: "",
    priority: 2,
  },
  {
    id: "sample-sea-weekend",
    category: "Our next adventure",
    emoji: "🏝️",
    name: "A weekend by the sea",
    description: "Help us make a few first memories somewhere new.",
    price: 40000,
    link: "",
    priority: 3,
  },
  ],
};

function loadAppData(): AppData {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return emptyAppData;
    const parsed: unknown = JSON.parse(stored);
    if (
      typeof parsed !== "object" || parsed === null ||
      !("accounts" in parsed) || !Array.isArray(parsed.accounts) ||
      !("registries" in parsed) || !Array.isArray(parsed.registries) ||
      !("activities" in parsed) || !Array.isArray(parsed.activities) ||
      !("sessionEmail" in parsed)
    ) {
      throw new Error("Saved demo data has an invalid shape");
    }
    return parsed as AppData;
  } catch (error) {
    console.error("Could not load saved ShaadiLedger demo data", error);
    return emptyAppData;
  }
}

function saveAppData(data: AppData): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error("Could not save ShaadiLedger demo data", error);
  }
}

async function hashPassword(password: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const saltBuffer = new ArrayBuffer(16);
  new Uint8Array(saltBuffer).set(hexToBytes(salt));
  const hash = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: saltBuffer, iterations: 120_000, hash: "SHA-256" },
    key,
    256,
  );
  return bytesToHex(new Uint8Array(hash));
}

function hexToBytes(value: string): Uint8Array {
  return new Uint8Array(value.match(/.{2}/g)?.map((pair) => Number.parseInt(pair, 16)) ?? []);
}

function bytesToHex(value: Uint8Array): string {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function makeSlug(firstName: string, partnerName: string): string {
  const slug = `${firstName}-${partnerName}`
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || `wedding-${Date.now().toString(36)}`;
}

function getRequestedSlug(): string | null {
  const query = window.location.hash.split("?")[1];
  return query ? new URLSearchParams(query).get("slug") : null;
}

function getRequestedGuestToken(): string | null {
  const query = window.location.hash.split("?")[1];
  const token = query ? new URLSearchParams(query).get("token") : null;
  return token && /^[0-9a-f]{64}$/i.test(token) ? token : null;
}

function getRegistryLink(registry: Registry): string {
  return `${window.location.origin}${window.location.pathname}#public-registry?slug=${encodeURIComponent(registry.slug)}`;
}

function isLocalDevelopmentHost(): boolean {
  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}

function getExternalUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

function getProductImageUrl(productUrl: string): string | null {
  const validUrl = getExternalUrl(productUrl);
  if (!validUrl) return null;
  const url = new URL(validUrl);
  return new URL("/favicon.ico", url.origin).href;
}

function isValidGuestContact(value: string): boolean {
  const contact = value.trim();
  const isEmail = contact.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact);
  const isPhone = contact.length >= 7 && contact.length <= 20 &&
    /^\+?[0-9 ()-]+$/.test(contact);
  return isEmail || isPhone;
}

function orderedGifts(gifts: Gift[]): Array<Gift & { priority: number }> {
  return gifts
    .map((gift, index) => ({
      gift,
      priority: Number.isInteger(gift.priority) && (gift.priority ?? 0) > 0 ? gift.priority ?? index + 1 : index + 1,
    }))
    .sort((first, second) => first.priority - second.priority)
    .map(({ gift, priority }) => ({ ...gift, priority }));
}

function withGiftPriorities(gifts: Gift[]): Gift[] {
  return gifts.map((gift, index) => ({ ...gift, priority: index + 1 }));
}

function getGiftCommittedAmount(gift: Gift, activities: GuestActivity[]): number {
  const giftActivities = activities.filter((activity) =>
    activity.giftId === gift.id &&
    ["reserved", "pledged", "payment_reported", "verified"].includes(activity.status)
  );
  if (giftActivities.some((activity) => activity.kind === "reservation" && activity.status === "reserved")) {
    return gift.price;
  }
  return giftActivities
    .filter((activity) => activity.kind === "contribution")
    .reduce((total, activity) => total + activity.amount, 0);
}

function registryNames(registry: Registry): string {
  return `${registry.firstName} & ${registry.partnerName}`;
}

async function copyLink(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Try the selection-based fallback when clipboard permissions are unavailable.
  }

  const field = document.createElement("textarea");
  field.value = value;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.appendChild(field);
  field.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch (error) {
    console.error("Could not copy the registry link", error);
  } finally {
    field.remove();
  }
  return copied;
}

function formatWeddingDate(value: string): string {
  if (!value) return "Wedding date to be announced";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

const money = (amount: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);

function getScreen(): Screen {
  const screen = window.location.hash.slice(1).split("?")[0] as Screen;
  return screens.some(([key]) => key === screen) ? screen : "landing";
}

function App() {
  const [screen, setScreen] = useState<Screen>(getScreen);
  const remoteMode = isSupabaseConfigured;
  const [appData, setAppData] = useState<AppData>(() => remoteMode ? emptyAppData : loadAppData());
  const [backendSession, setBackendSession] = useState<SupabaseSession | null>(null);
  const [backendRegistry, setBackendRegistry] = useState<RegistryDetails | null>(null);
  const [backendReady, setBackendReady] = useState(!remoteMode);
  const [backendMessage, setBackendMessage] = useState(supabaseConfigurationError ?? "");
  const [publicRegistry, setPublicRegistry] = useState<Registry | null>(null);
  const [publicRegistryLoading, setPublicRegistryLoading] = useState(false);
  const [selectedGiftId, setSelectedGiftId] = useState<string | null>(null);
  const [selectedRegistryId, setSelectedRegistryId] = useState<string | null>(null);
  const [selectedGuestRegistry, setSelectedGuestRegistry] = useState<Registry | null>(null);
  const [editingGiftId, setEditingGiftId] = useState<string | null>(null);
  const [guestActivityId, setGuestActivityId] = useState<string | null>(null);
  const [remoteGuestActivity, setRemoteGuestActivity] = useState<GuestActivityDetails | null>(null);
  const [guestStatusLoading, setGuestStatusLoading] = useState(false);
  const [guestStatusError, setGuestStatusError] = useState("");
  const [managementActivities, setManagementActivities] = useState<RegistryManagementActivity[]>([]);
  const [managementLoading, setManagementLoading] = useState(false);
  const [managementError, setManagementError] = useState("");
  const [managementReload, setManagementReload] = useState(0);
  const [paymentSettings, setPaymentSettings] = useState<RegistryPaymentSettings | null>(null);
  const [paymentSettingsLoading, setPaymentSettingsLoading] = useState(remoteMode);
  const [paymentSettingsError, setPaymentSettingsError] = useState("");
  const [paymentSettingsReload, setPaymentSettingsReload] = useState(0);
  const requestedSlug = getRequestedSlug();
  const guestToken = getRequestedGuestToken();
  const activeRegistry = useMemo(
    () => appData.registries.find((registry) => registry.ownerEmail === appData.sessionEmail) ?? null,
    [appData.registries, appData.sessionEmail],
  );
  const requestedRegistry = requestedSlug
    ? appData.registries.find((registry) => registry.slug === requestedSlug) ?? null
    : null;
  const activeGuestActivity = appData.activities.find((activity) => activity.id === guestActivityId);
  const activityRegistry = activeGuestActivity
    ? appData.registries.find((registry) => registry.id === activeGuestActivity.registryId) ?? null
    : null;
  const selectedRegistry = appData.registries.find((registry) => registry.id === selectedRegistryId) ?? null;
  const selectedFlowRegistry = screen === "contribute" || screen === "reserve-gift"
    ? selectedGuestRegistry
    : null;
  const currentRegistry = requestedSlug && remoteMode
    ? publicRegistry ?? requestedRegistry ?? sampleRegistry
    : requestedRegistry ?? selectedFlowRegistry ?? activeRegistry ?? selectedRegistry ?? selectedGuestRegistry ?? activityRegistry ?? sampleRegistry;
  const requestedRegistryUnavailable = requestedSlug !== null &&
    requestedRegistry === null &&
    (remoteMode ? !publicRegistryLoading && !publicRegistry : true);

  useEffect(() => {
    if (!remoteMode) return;
    let active = true;
    void (async () => {
      try {
        const session = await restoreSession();
        if (!active || !session) return;
        setBackendSession(session);
        const { registry, session: refreshedSession } = await getOwnedRegistry(session);
        if (!active) return;
        setBackendSession(refreshedSession);
        setBackendRegistry(registry);
        setAppData((current) => ({
          ...current,
          sessionEmail: refreshedSession.user.email,
          registries: registry ? [toAppRegistry(registry)] : [],
        }));
      } catch (error) {
        console.error("Could not restore the Supabase session or registry", error);
        if (active) setBackendMessage(error instanceof Error ? error.message : "Could not connect to your account.");
      } finally {
        if (active) setBackendReady(true);
      }
    })();
    return () => { active = false; };
  }, [remoteMode]);

  useEffect(() => {
    if (!remoteMode || !requestedSlug) {
      setPublicRegistry(null);
      setPublicRegistryLoading(false);
      return;
    }
    let active = true;
    setPublicRegistry(null);
    setPublicRegistryLoading(true);
    void getPublicRegistry(requestedSlug)
      .then((registry) => {
        if (active && registry) setPublicRegistry(toPublicAppRegistry(registry));
      })
      .catch((error: unknown) => {
        console.error("Could not load the public Supabase registry", error);
        if (active) setBackendMessage(error instanceof Error ? error.message : "Could not load this registry.");
      })
      .finally(() => {
        if (active) setPublicRegistryLoading(false);
      });
    return () => { active = false; };
  }, [remoteMode, requestedSlug, requestedRegistry]);

  useEffect(() => {
    if (!remoteMode || screen !== "guest-status") {
      setRemoteGuestActivity(null);
      setGuestStatusError("");
      setGuestStatusLoading(false);
      return;
    }
    if (!guestToken) {
      setRemoteGuestActivity(null);
      setGuestStatusError("This private status link is missing a valid access token.");
      setGuestStatusLoading(false);
      return;
    }
    let active = true;
    setRemoteGuestActivity(null);
    setGuestStatusError("");
    setGuestStatusLoading(true);
    void getGuestActivity(guestToken)
      .then((activity) => {
        if (active) setRemoteGuestActivity(activity);
      })
      .catch((error: unknown) => {
        console.error("Could not load guest status", error);
        if (active) setGuestStatusError(error instanceof Error ? error.message : "Could not load this guest status.");
      })
      .finally(() => {
        if (active) setGuestStatusLoading(false);
      });
    return () => { active = false; };
  }, [remoteMode, screen, guestToken]);

  useEffect(() => {
    if (!remoteMode || screen !== "management") {
      setManagementLoading(false);
      setManagementError("");
      return;
    }
    if (!backendSession || !backendRegistry) {
      setManagementActivities([]);
      setManagementLoading(false);
      setManagementError("");
      return;
    }
    let active = true;
    setManagementLoading(true);
    setManagementError("");
    void getRegistryManagementActivities(backendSession, backendRegistry.id)
      .then((result) => {
        if (!active) return;
        setBackendSession(result.session);
        setManagementActivities(result.activities);
      })
      .catch((error: unknown) => {
        console.error("Could not load registry guest activity", error);
        if (active) setManagementError(error instanceof Error ? error.message : "Could not load guest activity.");
      })
      .finally(() => {
        if (active) setManagementLoading(false);
      });
    return () => { active = false; };
  }, [remoteMode, screen, backendSession, backendRegistry?.id, managementReload]);

  useEffect(() => {
    if (!remoteMode || screen !== "dashboard" || !backendSession || !backendRegistry) {
      setPaymentSettingsLoading(false);
      setPaymentSettingsError("");
      return;
    }
    let active = true;
    setPaymentSettingsLoading(true);
    setPaymentSettingsError("");
    void getRegistryPaymentSettings(backendSession, backendRegistry.id)
      .then((result) => {
        if (!active) return;
        setBackendSession(result.session);
        setPaymentSettings(result.settings);
      })
      .catch((error: unknown) => {
        console.error("Could not load registry payment instructions", error);
        if (active) setPaymentSettingsError(error instanceof Error ? error.message : "Could not load payment instructions.");
      })
      .finally(() => {
        if (active) setPaymentSettingsLoading(false);
      });
    return () => { active = false; };
  }, [remoteMode, screen, backendSession, backendRegistry?.id, paymentSettingsReload]);

  useEffect(() => {
    const syncScreen = () => setScreen(getScreen());
    window.addEventListener("hashchange", syncScreen);
    return () => window.removeEventListener("hashchange", syncScreen);
  }, []);

  useEffect(() => {
    if (!remoteMode) saveAppData(appData);
  }, [appData, remoteMode]);

  const updateAppData = (updater: (current: AppData) => AppData) => {
    setAppData((current) => updater(current));
  };

  const loadBackendAccount = async (session: SupabaseSession): Promise<boolean> => {
    setBackendSession(session);
    const result = await getOwnedRegistry(session);
    setBackendSession(result.session);
    setBackendRegistry(result.registry);
    setAppData((current) => ({
      ...current,
      sessionEmail: result.session.user.email,
      registries: result.registry ? [toAppRegistry(result.registry)] : [],
    }));
    setBackendMessage("");
    return result.registry !== null;
  };

  const saveBackendRegistry = async (
    details: Omit<RegistryDetails, "id" | "ownerId" | "ownerEmail" | "isPublished" | "gifts" | "categories">,
    existing: RegistryDetails | null,
  ): Promise<Registry> => {
    if (!backendSession) throw new Error("Please sign in again before saving your registry.");
    const result = await saveRegistry(backendSession, details, existing);
    const savedDetails = {
      ...result.registry,
      gifts: existing ? backendRegistry?.gifts ?? [] : [],
      categories: existing ? backendRegistry?.categories ?? [] : [],
    };
    const registry = toAppRegistry(savedDetails);
    setBackendSession(result.session);
    setBackendRegistry(savedDetails);
    setAppData((current) => ({
      ...current,
      sessionEmail: result.session.user.email,
      registries: [registry],
    }));
    setBackendMessage("");
    return registry;
  };

  const persistGiftChanges = async (registryId: string, gift: Gift, gifts: Gift[]): Promise<void> => {
    let session = backendSession;
    if (remoteMode) {
      if (!session) throw new Error("Please sign in again before saving wishlist changes.");
      const persistedGift: RegistryGift = {
        id: gift.id,
        category: gift.category,
        name: gift.name,
        description: gift.description,
        price: gift.price,
        link: gift.link,
        priority: gift.priority ?? gifts.findIndex((item) => item.id === gift.id) + 1,
      };
      session = await saveRegistryGift(
        session,
        registryId,
        persistedGift,
        gifts.map((item) => item.id),
      );
      setBackendSession(session);
    }

    const categories = [...new Set(gifts.map((item) => item.category.trim()).filter(Boolean))];
    updateAppData((current) => ({
      ...current,
      registries: current.registries.map((registry) =>
        registry.id === registryId
          ? { ...registry, gifts, categories: [...new Set([...(registry.categories ?? []), ...categories])] }
          : registry
      ),
    }));
    if (remoteMode) {
      const persistedGifts: RegistryGift[] = gifts.map(({ emoji: _emoji, ...item }, index) => ({
        ...item,
        priority: index + 1,
      }));
      setBackendRegistry((current) => current && current.id === registryId
        ? {
          ...current,
          gifts: persistedGifts,
          categories: [...new Set([...current.categories, ...categories])],
        }
        : current);
    }
    setBackendMessage("");
  };

  const persistGiftOrder = async (registryId: string, gifts: Gift[]): Promise<void> => {
    if (remoteMode) {
      if (!backendSession) throw new Error("Please sign in again before changing wishlist priority.");
      const session = await reorderRegistryGifts(
        backendSession,
        registryId,
        gifts.map((gift) => gift.id),
      );
      setBackendSession(session);
    }
    const prioritized = withGiftPriorities(gifts);
    updateAppData((current) => ({
      ...current,
      registries: current.registries.map((registry) =>
        registry.id === registryId ? { ...registry, gifts: prioritized } : registry
      ),
    }));
    if (remoteMode) {
      const persistedGifts: RegistryGift[] = prioritized.map(({ emoji: _emoji, ...gift }, index) => ({
        ...gift,
        priority: index + 1,
      }));
      setBackendRegistry((current) => current && current.id === registryId
        ? {
          ...current,
          gifts: persistedGifts,
        }
        : current);
    }
    setBackendMessage("");
  };

  const refreshManagementActivities = async (session: SupabaseSession, registryId: string): Promise<void> => {
    const result = await getRegistryManagementActivities(session, registryId);
    setBackendSession(result.session);
    setManagementActivities(result.activities);
  };

  const manageReservation = async (reservationId: string): Promise<void> => {
    if (!backendSession || !backendRegistry) throw new Error("Please sign in again to manage reservations.");
    const session = await releaseRegistryReservation(backendSession, reservationId);
    await refreshManagementActivities(session, backendRegistry.id);
  };

  const managePledge = async (contributionId: string): Promise<void> => {
    if (!backendSession || !backendRegistry) throw new Error("Please sign in again to manage contributions.");
    const session = await releaseRegistryPledge(backendSession, contributionId);
    await refreshManagementActivities(session, backendRegistry.id);
  };

  const decideContribution = async (
    contributionId: string,
    decision: "verified" | "rejected",
    reason: string,
  ): Promise<void> => {
    if (!backendSession || !backendRegistry) throw new Error("Please sign in again to review contributions.");
    const session = await reviewRegistryContribution(backendSession, contributionId, decision, reason);
    await refreshManagementActivities(session, backendRegistry.id);
  };

  const savePaymentSettings = async (settings: RegistryPaymentSettings): Promise<void> => {
    if (!backendSession || !backendRegistry) throw new Error("Please sign in again before saving payment instructions.");
    const result = await saveRegistryPaymentSettings(backendSession, backendRegistry.id, settings);
    setBackendSession(result.session);
    setPaymentSettings(result.settings);
    setPaymentSettingsError("");
  };

  const publishBackendRegistry = async (registry: Registry, isPublished: boolean): Promise<void> => {
    if (!backendSession) throw new Error("Please sign in again before changing your registry's visibility.");
    const session = await updateRegistryPublication(backendSession, registry.id, isPublished);
    setBackendSession(session);
    setBackendRegistry((current) => current ? { ...current, isPublished } : current);
    setAppData((current) => ({
      ...current,
      registries: current.registries.map((item) =>
        item.id === registry.id ? { ...item, isPublished } : item
      ),
    }));
    setBackendMessage("");
  };

  const signOutBackend = async () => {
    try {
      await signOut(backendSession);
    } catch (error) {
      console.error("Could not revoke the Supabase session during sign out", error);
      setBackendMessage("You were signed out on this device, but Supabase could not revoke the server session.");
    } finally {
      setBackendSession(null);
      setBackendRegistry(null);
      setAppData((current) => ({ ...current, sessionEmail: null, registries: [] }));
      navigate("landing");
    }
  };

  const navigate = (nextScreen: Screen, query = "") => {
    window.location.hash = `${nextScreen}${query}`;
    setScreen(nextScreen);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="app-shell">
      <div className="prototype-notice">
        <span className="notice-dot" />
        {remoteMode
          ? "Supabase mode · Account and wedding registry details sync to your project"
          : "Preview mode · Changes are saved only in this browser"}
      </div>
      {backendMessage && <p className="form-error backend-message" role="alert">{backendMessage}</p>}
      <header className="site-header">
        <a
          className="brand"
          href="#landing"
          onClick={() => navigate("landing")}
          aria-label="ShaadiLedger home"
        >
          <span className="brand-mark">s</span>
          <span>shaadi<span className="brand-light">ledger</span></span>
        </a>
        <nav className="header-actions" aria-label="Main navigation">
          {appData.sessionEmail ? (
            <>
              <button className="text-button" onClick={() => navigate(activeRegistry ? "dashboard" : "create-registry")}>
                {activeRegistry ? "Your dashboard" : "Finish your registry"}
              </button>
              <button
                className="button button-dark button-small"
                onClick={() => {
                  if (remoteMode) void signOutBackend();
                  else {
                    updateAppData((current) => ({ ...current, sessionEmail: null }));
                    navigate("landing");
                  }
                }}
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <a href="#public-registry" onClick={() => navigate("public-registry")}>
                Find a registry
              </a>
              <button className="button button-dark button-small" onClick={() => navigate("login")}>
                Couple sign in <span aria-hidden="true">↗</span>
              </button>
            </>
          )}
        </nav>
      </header>

      <main>
        {screen === "landing" && <Landing navigate={navigate} />}
        {screen === "login" && (
          <Login
            key={screen}
            navigate={navigate}
            accounts={appData.accounts}
            onUpdate={updateAppData}
            remoteMode={remoteMode}
            onBackendSession={loadBackendAccount}
            backendReady={backendReady}
          />
        )}
        {screen === "create-account" && (
          <Login
            key={screen}
            navigate={navigate}
            accounts={appData.accounts}
            onUpdate={updateAppData}
            initialCreatingAccount
            remoteMode={remoteMode}
            onBackendSession={loadBackendAccount}
            backendReady={backendReady}
          />
        )}
        {screen === "create-registry" && (
          <CreateRegistry
            navigate={navigate}
            appData={appData}
            existingRegistry={activeRegistry}
            onUpdate={updateAppData}
            remoteMode={remoteMode}
            backendSession={backendSession}
            backendRegistry={backendRegistry}
            onSaveBackendRegistry={saveBackendRegistry}
          />
        )}
        {screen === "dashboard" && (
          <Dashboard
            navigate={navigate}
            registry={activeRegistry}
            activities={appData.activities}
            onCopyLink={copyLink}
            remoteMode={remoteMode}
            onTogglePublished={publishBackendRegistry}
            onEditRegistry={() => navigate("create-registry")}
            paymentSettings={paymentSettings}
            paymentSettingsLoading={paymentSettingsLoading}
            paymentSettingsError={paymentSettingsError}
            onRetryPaymentSettings={() => setPaymentSettingsReload((current) => current + 1)}
            onSavePaymentSettings={savePaymentSettings}
            onReorderGifts={(gifts) => persistGiftOrder(activeRegistry?.id ?? "", gifts)}
            onAddGift={() => {
              setEditingGiftId(null);
              navigate("edit-gift");
            }}
            onEditGift={(giftId) => {
              setEditingGiftId(giftId);
              navigate("edit-gift");
            }}
          />
        )}
        {screen === "edit-gift" && (
          <EditGift
            navigate={navigate}
            registry={activeRegistry}
            existingGift={activeRegistry?.gifts.find((gift) => gift.id === editingGiftId) ?? null}
            activities={appData.activities}
            remoteMode={remoteMode}
            onSave={(gift, gifts) => persistGiftChanges(activeRegistry?.id ?? "", gift, gifts)}
          />
        )}
        {screen === "public-registry" && (
          <PublicRegistry
            navigate={navigate}
            registry={requestedRegistryUnavailable ? null : currentRegistry}
            activities={appData.activities}
            remoteMode={remoteMode}
            loading={publicRegistryLoading}
            onChooseGift={(giftId) => {
              setSelectedGiftId(giftId);
              setSelectedRegistryId(currentRegistry.id);
              setSelectedGuestRegistry(currentRegistry);
            }}
          />
        )}
        {screen === "reserve-gift" && (
          <ReserveGift
            registry={currentRegistry}
            gift={currentRegistry.gifts.find((gift) => gift.id === selectedGiftId) ?? currentRegistry.gifts[0] ?? null}
            activities={appData.activities}
            remoteMode={remoteMode}
            onSubmit={async (gift, guestName, contact) => {
              if (remoteMode) {
                const result = await createGuestReservation(gift.id, guestName, contact);
                navigate("guest-status", `?token=${encodeURIComponent(result.guest_token)}`);
                return;
              }
              const activity = {
                id: crypto.randomUUID(),
                registryId: currentRegistry.id,
                giftId: gift.id,
                kind: "reservation" as const,
                guestName,
                contact,
                amount: gift.price,
                status: "reserved" as const,
              };
              updateAppData((current) => ({ ...current, activities: [...current.activities, activity] }));
              setGuestActivityId(activity.id);
              navigate("guest-status");
            }}
          />
        )}
        {screen === "contribute" && (
          <Contribute
            registry={currentRegistry}
            gift={currentRegistry.gifts.find((gift) => gift.id === selectedGiftId) ?? currentRegistry.gifts[0] ?? null}
            activities={appData.activities}
            remoteMode={remoteMode}
            onSubmit={async (gift, guestName, contact, amount) => {
              if (remoteMode) {
                const result = await createGuestPledge(gift.id, amount, guestName, contact);
                navigate("guest-status", `?token=${encodeURIComponent(result.guest_token)}`);
                return;
              }
              const activity = {
                id: crypto.randomUUID(),
                registryId: currentRegistry.id,
                giftId: gift.id,
                kind: "contribution" as const,
                guestName,
                contact,
                amount,
                status: "pledged" as const,
              };
              updateAppData((current) => ({ ...current, activities: [...current.activities, activity] }));
              setGuestActivityId(activity.id);
              navigate("guest-status");
            }}
          />
        )}
        {screen === "guest-status" && remoteMode && (
          <GuestStatus
            navigate={navigate}
            activity={remoteGuestActivity}
            registry={selectedGuestRegistry ?? { ...currentRegistry, slug: "" }}
            loading={guestStatusLoading}
            error={guestStatusError}
            remoteMode
            onCopyLink={() => copyLink(window.location.href)}
            onCancelReservation={async () => {
              if (!guestToken) throw new Error("This private status link is missing a valid access token.");
              await cancelGuestReservation(guestToken);
              setRemoteGuestActivity(await getGuestActivity(guestToken));
            }}
            onReportPayment={async () => {
              if (!guestToken) throw new Error("This private status link is missing a valid access token.");
              await reportGuestPayment(guestToken);
              setRemoteGuestActivity(await getGuestActivity(guestToken));
            }}
          />
        )}
        {screen === "guest-status" && !remoteMode && (
          <GuestStatus
            navigate={navigate}
            activity={appData.activities.find((activity) => activity.id === guestActivityId) ?? null}
            registry={currentRegistry}
            loading={false}
            error=""
            remoteMode={false}
          />
        )}
        {screen === "management" && (
          <Management
            navigate={navigate}
            registry={activeRegistry}
            activities={managementActivities}
            remoteMode={remoteMode}
            loading={managementLoading}
            error={managementError}
            onRetry={() => setManagementReload((current) => current + 1)}
            onReleaseReservation={manageReservation}
            onReleasePledge={managePledge}
            onReviewContribution={decideContribution}
          />
        )}
      </main>

      <footer className="site-footer">
        <div className="footer-top">
          <a className="brand footer-brand" href="#landing" onClick={() => navigate("landing")}>
            <span className="brand-mark">s</span>
            <span>shaadi<span className="brand-light">ledger</span></span>
          </a>
          <p>Made for the beginning of everything.</p>
        </div>
        <details className="prototype-menu">
          <summary>Explore prototype screens</summary>
          <div className="prototype-links">
            {screens.map(([key, title]) => (
              <button key={key} onClick={() => navigate(key)}>{title}</button>
            ))}
          </div>
        </details>
        <div className="footer-bottom">
          <span>© 2026 ShaadiLedger</span>
          <span>Private celebrations, thoughtfully shared.</span>
        </div>
      </footer>
    </div>
  );
}

type Navigate = (screen: Screen, query?: string) => void;

function Eyebrow({ children }: { children: string }) {
  return <p className="eyebrow">{children}</p>;
}

function PageIntro({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="page-intro">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
  );
}

function Landing({ navigate }: { navigate: Navigate }) {
  return (
    <>
      <section className="hero section-wrap">
        <div className="hero-copy">
          <Eyebrow>A more meaningful way to celebrate</Eyebrow>
          <h1>Gifts that feel<br />like <em>you.</em></h1>
          <p className="hero-description">
            A thoughtful place to gather the things you love, and make it easy
            for the people you love to be part of it.
          </p>
          <div className="hero-actions">
            <button className="button button-dark" onClick={() => navigate("create-account")}>
              Create your registry <span aria-hidden="true">↗</span>
            </button>
            <button className="text-button" onClick={() => navigate("public-registry")}>
              Explore a sample <span aria-hidden="true">→</span>
            </button>
          </div>
          <div className="hero-note">
            <span className="avatar-stack" aria-hidden="true"><i>A</i><i>P</i></span>
            <span>Made for two. Shared with everyone.</span>
          </div>
        </div>
        <div className="hero-art" aria-label="Wedding flowers and a sample registry card">
          <div className="art-sun" />
          <div className="art-flower flower-one">✿</div>
          <div className="art-flower flower-two">✿</div>
          <div className="art-leaf leaf-one">⌁</div>
          <div className="art-leaf leaf-two">⌁</div>
          <div className="hero-card">
            <div className="hero-card-top"><span>OUR WEDDING</span><span>✳</span></div>
            <p className="script-name">Aarav <span>&</span> Priya</p>
            <div className="card-divider" />
            <p className="hero-card-date">14 February 2027 · Jaipur</p>
            <div className="mini-gift">
              <span className="mini-gift-image">🪑</span>
              <span><b>A little reading nook</b><small>For our first home together</small></span>
              <span className="mini-heart">♡</span>
            </div>
          </div>
          <span className="art-caption">a collection of little wishes</span>
        </div>
      </section>

      <section className="intro-band">
        <div className="section-wrap intro-grid">
          <span className="intro-mark">✳</span>
          <p>Your people want to celebrate you.<br /><em>Let them do it your way.</em></p>
          <span className="intro-aside">A registry, with a little more heart.</span>
        </div>
      </section>

      <section className="section-wrap how-section">
        <div className="section-heading">
          <div><Eyebrow>Simple, from the first click</Eyebrow><h2>Thoughtful gifting.<br /><em>Made effortless.</em></h2></div>
          <p>One link brings your people a little closer to the things you're dreaming up together.</p>
        </div>
        <div className="steps-grid">
          <Step number="01" title="Make it yours" description="Create your wedding page and add the gifts, ideas, and experiences that feel like you." icon="✎" />
          <Step number="02" title="Share the love" description="Send one private link to the people you love. No app, account, or fuss for guests." icon="↗" />
          <Step number="03" title="Feel the love" description="Guests reserve a gift in full or contribute any amount, then pay you directly, offline." icon="♡" />
        </div>
      </section>

      <section className="registry-cta">
        <div className="section-wrap cta-inner">
          <div><Eyebrow>Your beginning, your way</Eyebrow><h2>A little more joy<br />in every <em>“I do.”</em></h2></div>
          <button className="button button-light" onClick={() => navigate("create-account")}>
            Start your registry <span aria-hidden="true">↗</span>
          </button>
          <span className="cta-flower" aria-hidden="true">✿</span>
        </div>
      </section>

      <section className="section-wrap screen-hint">
        <p>You're viewing the first visual prototype.</p>
        <button className="text-button" onClick={() => navigate("public-registry")}>See the guest wishlist <span aria-hidden="true">→</span></button>
      </section>
    </>
  );
}

function Step({ number, title, description, icon }: { number: string; title: string; description: string; icon: string }) {
  return (
    <article className="step-card">
      <div className="step-card-top"><span>{number}</span><span className="step-icon">{icon}</span></div>
      <h3>{title}</h3>
      <p>{description}</p>
    </article>
  );
}

function Login({
  navigate,
  accounts,
  onUpdate,
  remoteMode,
  onBackendSession,
  backendReady,
  initialCreatingAccount = false,
}: {
  navigate: Navigate;
  accounts: DemoAccount[];
  onUpdate: (updater: (current: AppData) => AppData) => void;
  remoteMode: boolean;
  onBackendSession: (session: SupabaseSession) => Promise<boolean>;
  backendReady: boolean;
  initialCreatingAccount?: boolean;
}) {
  const [creatingAccount, setCreatingAccount] = useState(initialCreatingAccount);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const password = String(form.get("password") ?? "");

    try {
      if (creatingAccount) {
        if (remoteMode) {
          const session = await signUp(email, password);
          if (!session) {
            setSuccess("Account created. Check your email to confirm it, then sign in to continue.");
            return;
          }
          const hasRegistry = await onBackendSession(session);
          navigate(hasRegistry ? "dashboard" : "create-registry");
          return;
        }
        if (accounts.some((account) => account.email === email)) {
          setError("An account with this email already exists in this browser. Sign in instead.");
          return;
        }
        const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
        const passwordHash = await hashPassword(password, salt);
        onUpdate((current) => ({
          ...current,
          accounts: [...current.accounts, { email, salt, passwordHash }],
          sessionEmail: email,
        }));
        navigate("create-registry");
        return;
      }

      if (remoteMode) {
        const session = await signIn(email, password);
        const hasRegistry = await onBackendSession(session);
        navigate(hasRegistry ? "dashboard" : "create-registry");
        return;
      }

      const account = accounts.find((item) => item.email === email);
      if (!account || await hashPassword(password, account.salt) !== account.passwordHash) {
        setError("Email or password is incorrect for accounts saved in this browser.");
        return;
      }
      onUpdate((current) => ({ ...current, sessionEmail: email }));
      navigate("dashboard");
    } catch (submitError) {
      console.error(`Could not complete ${remoteMode ? "Supabase" : "local demo"} authentication`, submitError);
      setError(submitError instanceof Error
        ? submitError.message
        : "Could not complete sign-in. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="form-page section-wrap">
      <div className="form-card">
        <PageIntro
          eyebrow={creatingAccount ? "A lovely beginning" : "Welcome back"}
          title={creatingAccount ? "Create your account." : "Your registry awaits."}
          description={creatingAccount ? "Start with an account, then make your wedding page." : "Sign in to make a little magic for your celebration."}
        />
        <form onSubmit={submit}>
          <label>Email address<input name="email" type="email" placeholder="you@example.com" autoComplete="email" required /></label>
          <label>Password<input name="password" type="password" minLength={8} placeholder={creatingAccount ? "Create a password (8+ characters)" : "Enter your password"} autoComplete={creatingAccount ? "new-password" : "current-password"} required /></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          {success && <p className="copy-message" role="status">{success}</p>}
          <button className="button button-dark button-wide" type="submit" disabled={busy || (remoteMode && !backendReady)}>
            {busy || (remoteMode && !backendReady) ? "Please wait..." : creatingAccount ? "Continue to registry details" : "Sign in"} <span aria-hidden="true">↗</span>
          </button>
        </form>
        <p className="form-footnote">
          {creatingAccount ? "Already have an account?" : "New to ShaadiLedger?"}{" "}
          <button onClick={() => setCreatingAccount(!creatingAccount)}>
            {creatingAccount ? "Sign in" : "Create an account"}
          </button>
        </p>
        <p className="prototype-help">
          {remoteMode
            ? "Your account is managed by Supabase. Email confirmation may be required before you can create a registry."
            : "Demo account only: credentials and registry data stay in this browser. This is not Supabase authentication."}
        </p>
      </div>
    </section>
  );
}

function CreateRegistry({
  navigate,
  appData,
  existingRegistry,
  onUpdate,
  remoteMode,
  backendSession,
  backendRegistry,
  onSaveBackendRegistry,
}: {
  navigate: Navigate;
  appData: AppData;
  existingRegistry: Registry | null;
  onUpdate: (updater: (current: AppData) => AppData) => void;
  remoteMode: boolean;
  backendSession: SupabaseSession | null;
  backendRegistry: RegistryDetails | null;
  onSaveBackendRegistry: (
    details: Omit<RegistryDetails, "id" | "ownerId" | "ownerEmail" | "isPublished" | "gifts" | "categories">,
    existing: RegistryDetails | null,
  ) => Promise<Registry>;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const ownerEmail = appData.sessionEmail;
    if (!ownerEmail || (remoteMode && !backendSession)) {
      navigate("login");
      return;
    }
    setError("");
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const firstName = String(form.get("firstName") ?? "").trim();
    const partnerName = String(form.get("partnerName") ?? "").trim();
    if (!firstName || !partnerName) {
      setError("Please enter both names to create your registry.");
      setBusy(false);
      return;
    }

    const existing = appData.registries.find((registry) => registry.ownerEmail === ownerEmail);
    let slug = (remoteMode ? backendRegistry?.slug : existing?.slug) ?? makeSlug(firstName, partnerName);
    if (!existing && appData.registries.some((registry) => registry.slug === slug)) {
      slug = `${slug}-${crypto.randomUUID().slice(0, 6)}`;
    }
    if (remoteMode) {
      try {
        await onSaveBackendRegistry({
          slug,
          firstName,
          partnerName,
          weddingDate: String(form.get("weddingDate") ?? ""),
          city: String(form.get("city") ?? "").trim(),
          welcomeMessage: String(form.get("welcomeMessage") ?? "").trim(),
        }, backendRegistry);
        navigate("dashboard");
      } catch (submitError) {
        console.error("Could not save registry to Supabase", submitError);
        setError(submitError instanceof Error ? submitError.message : "Could not save your registry. Please try again.");
      } finally {
        setBusy(false);
      }
      return;
    }
    const registry: Registry = {
      id: existing?.id ?? crypto.randomUUID(),
      slug,
      ownerEmail,
      firstName,
      partnerName,
      weddingDate: String(form.get("weddingDate") ?? ""),
      city: String(form.get("city") ?? "").trim(),
      welcomeMessage: String(form.get("welcomeMessage") ?? "").trim(),
      gifts: existing?.gifts ?? [],
      categories: existing?.categories ?? [],
    };
    onUpdate((current) => ({
      ...current,
      registries: [...current.registries.filter((item) => item.ownerEmail !== ownerEmail), registry],
      sessionEmail: ownerEmail,
    }));
    navigate("dashboard");
  };

  return (
    <section className="form-page section-wrap">
      <div className="form-card form-card-wide">
        <PageIntro eyebrow="A lovely beginning" title="Let's make it yours." description="Start with the details your guests will see." />
        <form onSubmit={submit}>
          <div className="field-row">
            <label>Your name<input name="firstName" placeholder="e.g. Aarav" autoComplete="given-name" defaultValue={existingRegistry?.firstName ?? ""} required /></label>
            <label>Your partner's name<input name="partnerName" placeholder="e.g. Priya" defaultValue={existingRegistry?.partnerName ?? ""} required /></label>
          </div>
          <div className="field-row">
            <label>Wedding date<input name="weddingDate" type="date" defaultValue={existingRegistry?.weddingDate ?? ""} /></label>
            <label>City<input name="city" placeholder="e.g. Jaipur" defaultValue={existingRegistry?.city ?? ""} /></label>
          </div>
          <label>A welcome note <span className="optional">(optional)</span><textarea name="welcomeMessage" rows={3} placeholder="A little note to the people celebrating with you..." defaultValue={existingRegistry?.welcomeMessage ?? ""} /></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button-dark button-wide" type="submit" disabled={busy}>{busy ? "Saving..." : "Save registry and continue"} <span aria-hidden="true">↗</span></button>
        </form>
        <p className="prototype-help">{remoteMode ? "Your wedding details are saved to your Supabase account." : "Your registry is saved in this browser only until Supabase is connected."}</p>
      </div>
    </section>
  );
}

function Dashboard({
  navigate,
  registry,
  activities,
  onCopyLink,
  onReorderGifts,
  onAddGift,
  onEditGift,
  remoteMode,
  onTogglePublished,
  onEditRegistry,
  paymentSettings,
  paymentSettingsLoading,
  paymentSettingsError,
  onRetryPaymentSettings,
  onSavePaymentSettings,
}: {
  navigate: Navigate;
  registry: Registry | null;
  activities: GuestActivity[];
  onCopyLink: (value: string) => Promise<boolean>;
  onReorderGifts: (gifts: Gift[]) => Promise<void>;
  onAddGift: () => void;
  onEditGift: (giftId: string) => void;
  remoteMode: boolean;
  onTogglePublished: (registry: Registry, isPublished: boolean) => Promise<void>;
  onEditRegistry: () => void;
  paymentSettings: RegistryPaymentSettings | null;
  paymentSettingsLoading: boolean;
  paymentSettingsError: string;
  onRetryPaymentSettings: () => void;
  onSavePaymentSettings: (settings: RegistryPaymentSettings) => Promise<void>;
}) {
  const [copyMessage, setCopyMessage] = useState("");
  const [publishMessage, setPublishMessage] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [reorderError, setReorderError] = useState("");
  if (!registry) {
    return (
      <section className="form-page section-wrap">
        <div className="form-card">
          <PageIntro eyebrow="YOUR DASHBOARD" title="Your registry is waiting." description="Create your wedding registry to manage your wishlist." />
          <button className="button button-dark button-wide" onClick={() => navigate("create-registry")}>Create your registry</button>
        </div>
      </section>
    );
  }
  const registryActivities = activities.filter((activity) => activity.registryId === registry.id);
  const reservedCount = registryActivities.filter((activity) => activity.status === "reserved").length;
  const verifiedTotal = registryActivities
    .filter((activity) => activity.kind === "contribution" && activity.status === "verified")
    .reduce((total, activity) => total + activity.amount, 0);

  const handleCopyLink = async () => {
    if (remoteMode && !registry.isPublished) return;
    const copied = await onCopyLink(getRegistryLink(registry));
    setCopyMessage(copied ? "Link copied!" : "Could not copy. Select and copy the link above.");
  };

  const handlePublication = async () => {
    setPublishMessage("");
    setPublishing(true);
    try {
      await onTogglePublished(registry, !registry.isPublished);
      setPublishMessage(registry.isPublished ? "Registry is now unpublished." : "Registry is now published and shareable.");
    } catch (error) {
      console.error("Could not change registry publication status", error);
      setPublishMessage(error instanceof Error ? error.message : "Could not update registry visibility.");
    } finally {
      setPublishing(false);
    }
  };

  return (
    <section className="dashboard-page section-wrap">
      <div className="dashboard-top">
        <div><Eyebrow>YOUR WEDDING REGISTRY</Eyebrow><h1>{registry.firstName} <em>&</em> {registry.partnerName}</h1><p className="muted">{formatWeddingDate(registry.weddingDate)}{registry.city && <> <span>·</span> {registry.city}</>}</p></div>
        <div className="dashboard-actions">
          {remoteMode && <button className="button button-outline" onClick={onEditRegistry}>Edit registry details</button>}
          <button className="button button-dark" onClick={() => navigate("public-registry")}>Preview registry <span aria-hidden="true">↗</span></button>
        </div>
      </div>
      <div className="dashboard-stats">
        <Stat value={String(registry.gifts.length).padStart(2, "0")} label="Gifts on your list" />
        <Stat value={String(reservedCount).padStart(2, "0")} label="Gifts reserved" />
        <Stat value={money(verifiedTotal)} label="Contributions verified" />
      </div>
      <div className="dashboard-grid">
        <article className="panel">
          <div className="panel-heading"><div><Eyebrow>YOUR WISHLIST</Eyebrow><h2>A few lovely things</h2></div><button className="text-button" onClick={onAddGift}>Add a gift +</button></div>
          {registry.gifts.length ? orderedGifts(registry.gifts).map((gift, index, gifts) => (
            <GiftRow
              key={gift.id}
              gift={gift}
              onEdit={() => onEditGift(gift.id)}
              onMove={async (direction) => {
                const reordered = [...gifts];
                const nextIndex = index + direction;
                [reordered[index], reordered[nextIndex]] = [reordered[nextIndex], reordered[index]];
                setReorderError("");
                setReordering(true);
                try {
                  await onReorderGifts(reordered);
                } catch (error) {
                  console.error("Could not save wishlist priority", error);
                  setReorderError(error instanceof Error ? error.message : "Could not save wishlist priority.");
                } finally {
                  setReordering(false);
                }
              }}
              canMoveUp={index > 0}
              canMoveDown={index < gifts.length - 1}
              disabled={reordering}
            />
          )) : (
            <div className="empty-list"><p>Your wishlist is empty for now.</p>{remoteMode
              ? <p>Add your first gift to start building your wishlist.</p>
              : <button className="text-button" onClick={onAddGift}>Add your first gift <span>→</span></button>}</div>
          )}
          {reorderError && <p className="form-error" role="alert">{reorderError}</p>}
        </article>
        <aside className="panel share-panel">
          <Eyebrow>YOUR REGISTRY LINK</Eyebrow><h2>Ready to share?</h2>
          <p>{remoteMode && !registry.isPublished
            ? "Publish your registry when its details are ready. Only published registries can be opened by guests."
            : "Guests with this link can browse your gifts, choose how to give, and pay you directly."}</p>
          {remoteMode && !registry.isPublished
            ? <span className="share-link">{getRegistryLink(registry)}</span>
            : <a className="share-link" href={getRegistryLink(registry)}>{getRegistryLink(registry)} <span>↗</span></a>}
          {remoteMode && <button className="button button-dark button-wide" onClick={() => void handlePublication()} disabled={publishing}>
            {publishing ? "Updating..." : registry.isPublished ? "Unpublish registry" : "Publish registry"}
          </button>}
          <button className="button button-outline button-wide" onClick={handleCopyLink} disabled={remoteMode && !registry.isPublished}>Copy link</button>
          {copyMessage && <p className={copyMessage === "Link copied!" ? "copy-message" : "form-error"} role="status">{copyMessage}</p>}
          {publishMessage && <p className={publishMessage.startsWith("Registry is") ? "copy-message" : "form-error"} role="status">{publishMessage}</p>}
          <p className="share-link-help">{isLocalDevelopmentHost()
            ? "This is a local development link. It only opens on this computer while the app server is running; guests need the deployed website URL."
            : remoteMode
            ? "Registry details, wishlist gifts, and guest activity are stored securely in Supabase."
            : "Preview links use browser-local demo data. Cross-device sharing needs the live Supabase connection."}</p>
          {remoteMode && <button className="button button-outline button-wide" onClick={() => navigate("management")}>Review guest activity</button>}
          <div className="member-note"><span className="member-avatar">{registry.firstName.slice(0, 1).toUpperCase()}</span><span><b>{registryNames(registry)}</b><small>Registry owner · {registry.ownerEmail}</small></span></div>
        </aside>
      </div>
      {remoteMode && (
        <PaymentSettingsForm
          settings={paymentSettings}
          loading={paymentSettingsLoading}
          error={paymentSettingsError}
          onRetry={onRetryPaymentSettings}
          onSave={onSavePaymentSettings}
        />
      )}
      <p className="prototype-help">{remoteMode
        ? "Account, wedding details, wishlist gifts, payment instructions, and guest activity are synced with Supabase."
        : "Demo data is saved in this browser only. It is not yet synced to Supabase or available on other devices."}</p>
    </section>
  );
}

function PaymentSettingsForm({
  settings,
  loading,
  error,
  onRetry,
  onSave,
}: {
  settings: RegistryPaymentSettings | null;
  loading: boolean;
  error: string;
  onRetry: () => void;
  onSave: (settings: RegistryPaymentSettings) => Promise<void>;
}) {
  const [values, setValues] = useState<RegistryPaymentSettings>({
    recipients: [],
    bankAccountName: "",
    bankAccountNumber: "",
    bankIfsc: "",
    cashInstructions: "",
    generalInstructions: "",
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (settings) setValues(settings);
  }, [settings]);

  const update = (key: keyof RegistryPaymentSettings, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    setMessage("");
  };

  const updateRecipient = (id: string, changes: Partial<RegistryPaymentRecipient>) => {
    setValues((current) => ({
      ...current,
      recipients: current.recipients.map((recipient) =>
        recipient.id === id ? { ...recipient, ...changes } : recipient
      ),
    }));
    setMessage("");
  };

  const addRecipient = () => {
    setValues((current) => ({
      ...current,
      recipients: [...current.recipients, {
        id: crypto.randomUUID(),
        displayName: "",
        upiId: "",
        qrImagePath: null,
        qrImageUrl: null,
        qrImageFile: null,
      }],
    }));
    setMessage("");
  };

  const removeRecipient = (id: string) => {
    setValues((current) => ({
      ...current,
      recipients: current.recipients.filter((recipient) => recipient.id !== id),
    }));
    setMessage("");
  };

  const selectQrImage = (id: string, file?: File) => {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setMessage("Choose a JPEG, PNG, or WebP QR image no larger than 5 MB.");
      return;
    }
    updateRecipient(id, { qrImageFile: file });
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    const bankFieldsPresent = Boolean(values.bankAccountName.trim() || values.bankAccountNumber.trim() || values.bankIfsc.trim());
    if (bankFieldsPresent && (!values.bankAccountName.trim() || !values.bankAccountNumber.trim())) {
      setMessage("Enter both the bank account name and account number, or leave both blank.");
      return;
    }
    if (values.bankIfsc.trim() && !/^[A-Z]{4}0[A-Z0-9]{6}$/i.test(values.bankIfsc.trim())) {
      setMessage("Enter a valid 11-character IFSC code.");
      return;
    }
    if (values.recipients.some((recipient) => !recipient.displayName.trim() || !recipient.upiId.trim())) {
      setMessage("Enter a name and UPI ID for each payment recipient, or remove the incomplete entry.");
      return;
    }
    if (new Set(values.recipients.map((recipient) => recipient.id)).size !== values.recipients.length) {
      setMessage("Each payment recipient must have a unique ID. Remove the duplicate entry and add it again.");
      return;
    }
    setSaving(true);
    void onSave(values)
      .then(() => setMessage("Payment instructions saved. Published guests can now view these details."))
      .catch((saveError: unknown) => {
        console.error("Could not save payment instructions", saveError);
        setMessage(saveError instanceof Error ? saveError.message : "Could not save payment instructions.");
      })
      .finally(() => setSaving(false));
  };

  return (
    <article className="panel payment-settings-panel">
      <div className="panel-heading">
        <div><Eyebrow>OFFLINE PAYMENT</Eyebrow><h2>Payment instructions</h2></div>
      </div>
      <p className="payment-settings-intro">Guests pay you directly. Details entered here appear on your published registry; ShaadiLedger never collects or processes payments.</p>
      {loading && <p role="status">Loading your saved payment instructions...</p>}
      {error && <div><p className="form-error" role="alert">{error}</p><button className="text-button" onClick={onRetry}>Retry loading instructions</button></div>}
      {!loading && !error && (
        <form onSubmit={submit}>
          <div className="payment-recipients">
            <div className="payment-recipients-heading">
              <div><h3>UPI payment options</h3><p>Add the couple's or a family member's UPI ID and QR code.</p></div>
              <button className="button button-outline" type="button" onClick={addRecipient} disabled={!settings || saving}>Add a person</button>
            </div>
            {values.recipients.length === 0 && <p className="share-link-help">No UPI options added yet. Guests can use the bank or cash details below.</p>}
            {values.recipients.map((recipient, index) => (
              <fieldset className="payment-recipient" key={recipient.id}>
                <legend>Person {index + 1}</legend>
                <label>Name shown to guests
                  <input value={recipient.displayName} onChange={(event) => updateRecipient(recipient.id, { displayName: event.target.value })} maxLength={100} placeholder="e.g. Maya" autoComplete="name" disabled={!settings || saving} required />
                </label>
                <label>UPI ID
                  <input value={recipient.upiId} onChange={(event) => updateRecipient(recipient.id, { upiId: event.target.value })} maxLength={120} placeholder="name@exampleupi" autoComplete="off" disabled={!settings || saving} required />
                </label>
                <label>UPI QR code <span className="optional">(optional · JPEG, PNG, or WebP up to 5 MB)</span>
                  <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => {
                    selectQrImage(recipient.id, event.target.files?.[0]);
                    event.target.value = "";
                  }} disabled={!settings || saving} />
                </label>
                {recipient.qrImageFile && (
                  <div className="payment-qr-file">
                    <span>Selected: {recipient.qrImageFile.name}</span>
                    <button className="text-button" type="button" onClick={() => updateRecipient(recipient.id, { qrImageFile: null })} disabled={!settings || saving}>Cancel selected QR</button>
                  </div>
                )}
                {recipient.qrImageUrl && !recipient.qrImageFile && (
                  <div className="payment-qr-preview">
                    <img src={recipient.qrImageUrl} alt={`${recipient.displayName || "Recipient"} UPI QR code`} />
                    <button className="text-button" type="button" onClick={() => updateRecipient(recipient.id, { qrImageFile: null, qrImagePath: null, qrImageUrl: null })} disabled={!settings || saving}>Remove QR code</button>
                  </div>
                )}
                {recipient.qrImagePath && !recipient.qrImageUrl && !recipient.qrImageFile && (
                  <button className="text-button" type="button" onClick={() => updateRecipient(recipient.id, { qrImagePath: null })} disabled={!settings || saving}>Remove QR code</button>
                )}
                <button className="text-button payment-recipient-remove" type="button" onClick={() => removeRecipient(recipient.id)} disabled={!settings || saving}>Remove this person</button>
              </fieldset>
            ))}
          </div>
          <div className="field-row">
            <label>Bank account name <span className="optional">(optional)</span>
              <input value={values.bankAccountName} onChange={(event) => update("bankAccountName", event.target.value)} maxLength={160} autoComplete="name" disabled={!settings || saving || loading} />
            </label>
            <label>Bank account number <span className="optional">(optional)</span>
              <input value={values.bankAccountNumber} onChange={(event) => update("bankAccountNumber", event.target.value)} maxLength={64} inputMode="numeric" autoComplete="off" disabled={!settings || saving || loading} />
            </label>
          </div>
          <label>IFSC code <span className="optional">(optional)</span>
            <input value={values.bankIfsc} onChange={(event) => update("bankIfsc", event.target.value.toUpperCase())} maxLength={11} autoCapitalize="characters" placeholder="ABCD0123456" autoComplete="off" disabled={!settings || saving || loading} />
          </label>
          <label>Cash instructions <span className="optional">(optional)</span>
            <textarea value={values.cashInstructions} onChange={(event) => update("cashInstructions", event.target.value)} maxLength={1000} rows={2} placeholder="How guests can give you cash" disabled={!settings || saving || loading} />
          </label>
          <label>Additional instructions <span className="optional">(optional)</span>
            <textarea value={values.generalInstructions} onChange={(event) => update("generalInstructions", event.target.value)} maxLength={2000} rows={3} placeholder="Add a transfer reference or any other helpful note" disabled={!settings || saving || loading} />
          </label>
          {message && <p className={message.startsWith("Payment instructions saved") ? "copy-message" : "form-error"} role="status">{message}</p>}
          <button className="button button-dark" type="submit" disabled={!settings || saving || loading}>
            {saving ? "Saving instructions..." : "Save payment instructions"}
          </button>
        </form>
      )}
      <p className="share-link-help">Bank details, UPI IDs, and QR codes are visible to anyone who can open your published registry. Only share details you have permission to publish.</p>
    </article>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return <div className="stat-card"><strong>{value}</strong><span>{label}</span></div>;
}

function GiftImage({ gift, className }: { gift: Gift; className: string }) {
  const [failed, setFailed] = useState(false);
  const imageUrl = getProductImageUrl(gift.link);
  useEffect(() => setFailed(false), [imageUrl]);
  if (imageUrl && !failed) {
    return <img className={className} src={imageUrl} alt={gift.name} onError={() => setFailed(true)} />;
  }
  return <span className={`${className} gift-artwork-placeholder`} aria-hidden="true">{gift.name.trim().slice(0, 1).toUpperCase() || "♡"}</span>;
}

function GiftRow({
  gift,
  onEdit,
  onMove,
  canMoveUp,
  canMoveDown,
  disabled,
}: {
  gift: Gift;
  onEdit: () => void;
  onMove: (direction: -1 | 1) => void | Promise<void>;
  canMoveUp: boolean;
  canMoveDown: boolean;
  disabled: boolean;
}) {
  return (
    <div className="gift-row">
      <span className="gift-thumb"><GiftImage gift={gift} className="gift-thumb-artwork" /></span>
      <span className="gift-row-copy"><b>{gift.name}</b><small>Priority {gift.priority}</small></span>
      <span className="gift-row-price">{money(gift.price)}</span>
      <button type="button" className="text-button gift-edit-button" onClick={onEdit}>Edit</button>
      <div className="gift-priority-actions" aria-label={`${gift.name} priority`}>
        <button type="button" className="priority-button" aria-label={`Move ${gift.name} up`} disabled={!canMoveUp || disabled} onClick={() => onMove(-1)}>↑</button>
        <button type="button" className="priority-button" aria-label={`Move ${gift.name} down`} disabled={!canMoveDown || disabled} onClick={() => onMove(1)}>↓</button>
      </div>
    </div>
  );
}

function EditGift({
  navigate,
  registry,
  existingGift,
  activities,
  remoteMode,
  onSave,
}: {
  navigate: Navigate;
  registry: Registry | null;
  existingGift: Gift | null;
  activities: GuestActivity[];
  remoteMode: boolean;
  onSave: (gift: Gift, gifts: Gift[]) => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const priorityLimit = (registry?.gifts.length ?? 0) + (existingGift ? 0 : 1);
  const initialPriority = existingGift && registry
    ? orderedGifts(registry.gifts).findIndex((item) => item.id === existingGift.id) + 1
    : priorityLimit;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (!registry) {
      setError("Sign in and create a registry before adding gifts.");
      return;
    }
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const price = Number(form.get("price"));
    const priority = Number(form.get("priority"));
    const productLink = String(form.get("link") ?? "").trim();
    if (!name || !Number.isFinite(price) || price <= 0) {
      setError("Enter a gift name and a price greater than zero.");
      return;
    }
    if (!Number.isInteger(priority) || priority < 1 || priority > priorityLimit) {
      setError("Choose a valid wishlist priority.");
      return;
    }
    if (productLink && !getExternalUrl(productLink)) {
      setError("Product links must use http or https.");
      return;
    }
    if (existingGift && price < getGiftCommittedAmount(existingGift, activities)) {
      setError("The gift value cannot be lower than its active reservation or committed contributions.");
      return;
    }
    const category = existingGift?.category ?? "Wishlist";
    const gift: Gift = {
      id: existingGift?.id ?? crypto.randomUUID(),
      category,
      emoji: existingGift?.emoji ?? "🎁",
      name,
      description: String(form.get("description") ?? "").trim(),
      price,
      link: productLink,
      priority,
    };
    const existingGifts = orderedGifts(registry.gifts.filter((itemGift) => itemGift.id !== gift.id));
    const gifts = withGiftPriorities([
      ...existingGifts.slice(0, priority - 1),
      gift,
      ...existingGifts.slice(priority - 1),
    ]);
    const savingRequest = onSave(gift, gifts);
    if (!remoteMode) {
      void savingRequest.catch((saveError: unknown) => {
        console.error("Could not save wishlist gift", saveError);
        setError(saveError instanceof Error ? saveError.message : "Could not save this gift.");
      });
      navigate("dashboard");
      return;
    }
    setSaving(true);
    void savingRequest
      .then(() => navigate("dashboard"))
      .catch((saveError: unknown) => {
        console.error("Could not save wishlist gift to Supabase", saveError);
        setError(saveError instanceof Error ? saveError.message : "Could not save this gift.");
      })
      .finally(() => setSaving(false));
  };

  return (
    <section className="form-page section-wrap">
      <div className="form-card form-card-wide">
        <PageIntro eyebrow="Your wishlist" title={existingGift ? "Edit your wish." : "Add a little wish."} description="Tell your guests what you'd love and why it matters to you. Guests choose whether to reserve it or contribute toward it." />
        <form onSubmit={submit}>
          <label>Gift name<input name="name" defaultValue={existingGift?.name} placeholder="e.g. A little reading nook" required /></label>
          <label>What makes it special? <span className="optional">(optional)</span><textarea name="description" defaultValue={existingGift?.description} rows={3} placeholder="Add a note for your guests..." /></label>
          <label>Gift value<input name="price" type="number" min="1" step="0.01" defaultValue={existingGift?.price} placeholder="e.g. 18500" required /></label>
          <div className="field-row">
            <label>Wishlist priority<select name="priority" defaultValue={String(initialPriority)}>
              {Array.from({ length: priorityLimit }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}
            </select></label>
          </div>
          <label>Product link <span className="optional">(optional)</span><input name="link" type="url" defaultValue={existingGift?.link} placeholder="https://shop.example.com/gift" /></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button-dark button-wide" type="submit" disabled={saving}>{saving ? "Saving..." : existingGift ? "Save gift changes" : "Add gift to wishlist"} <span aria-hidden="true">↗</span></button>
          <button className="text-button" type="button" onClick={() => navigate("dashboard")}>Back to dashboard</button>
        </form>
        <p className="prototype-help">{remoteMode ? "Gift details and wishlist priority are saved to Supabase." : "Guest contribution choices are shown on the public wishlist. Demo gifts are saved in this browser only."}</p>
      </div>
    </section>
  );
}

function PublicRegistry({
  navigate,
  registry,
  activities,
  remoteMode,
  loading,
  onChooseGift,
}: {
  navigate: Navigate;
  registry: Registry | null;
  activities: GuestActivity[];
  remoteMode: boolean;
  loading: boolean;
  onChooseGift: (giftId: string) => void;
}) {
  if (loading) {
    return (
      <section className="form-page section-wrap">
        <div className="form-card"><PageIntro eyebrow="A MOMENT PLEASE" title="Finding their registry." description="Loading the couple's published wedding details." /></div>
      </section>
    );
  }
  if (!registry) {
    return (
      <section className="form-page section-wrap">
        <div className="form-card">
          <PageIntro
            eyebrow="REGISTRY UNAVAILABLE"
            title="We couldn't find this registry."
            description={remoteMode
              ? "This registry may not exist or may not have been published yet."
              : "This demo link only works in the browser where its registry was created. A shared, cross-device link will work once Supabase is connected."}
          />
          <button className="button button-dark button-wide" onClick={() => navigate("landing")}>Back to ShaadiLedger</button>
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="registry-cover">
        <div className="registry-cover-flower">✿</div>
        <Eyebrow>WITH FULL HEARTS, WE INVITE YOU</Eyebrow>
        <h1>{registry.firstName} <em>&</em> {registry.partnerName}</h1>
        <p>{formatWeddingDate(registry.weddingDate)}{registry.city && <> <span>·</span> {registry.city}</>}</p>
        <span className="cover-rule" />
        <p className="cover-note">{registry.welcomeMessage || "Your love is the best gift. If you'd like to give us something more, we've gathered a few things that feel like home."}</p>
      </section>
      <section className="section-wrap wishlist-section">
        <div className="section-heading wishlist-heading">
          <div><Eyebrow>A FEW THINGS WE'RE DREAMING OF</Eyebrow><h2>Our little <em>wishlist.</em></h2></div>
          <p>{remoteMode
            ? "Choose whether to reserve a gift in full or contribute any amount. Pay the couple directly."
            : "Choose how you would like to celebrate: reserve the whole gift or contribute any amount."}</p>
        </div>
        {registry.gifts.length ? (
          <div className="gift-grid">
            {orderedGifts(registry.gifts).map((gift, index) => {
              const giftActivities = activities.filter((activity) =>
                activity.registryId === registry.id && activity.giftId === gift.id &&
                ["reserved", "pledged", "payment_reported", "verified"].includes(activity.status)
              );
              const reserved = remoteMode
                ? gift.isReserved === true
                : giftActivities.some((activity) => activity.kind === "reservation" && activity.status === "reserved");
              const committed = remoteMode
                ? gift.committedAmount ?? 0
                : giftActivities.reduce((total, activity) => total + activity.amount, 0);
              const verified = remoteMode
                ? gift.verifiedAmount ?? 0
                : giftActivities.filter((activity) => activity.kind === "contribution" && activity.status === "verified")
                  .reduce((total, activity) => total + activity.amount, 0);
              const remaining = Math.max(0, gift.price - committed);
              const unavailable = reserved || remaining === 0;
              const productUrl = getExternalUrl(gift.link);
              return (
              <article className="wishlist-card" key={gift.id}>
                <div className={`wishlist-image wishlist-image-${(index % 3) + 1}`}>
                  <GiftImage gift={gift} className="wishlist-artwork" />
                </div>
                  <div className="wishlist-card-body">
                    <h3>{gift.name}</h3><p>{gift.description}</p>
                    <p className="gift-price">{money(gift.price)}</p>
                    {productUrl && <a className="product-link" href={productUrl} target="_blank" rel="noopener noreferrer">View gift online <span aria-hidden="true">↗</span></a>}
                  {reserved && <p className="availability-note">Already reserved by a guest.</p>}
                  {!reserved && committed > 0 && <p className="availability-note">{money(remaining)} remaining for contributions.</p>}
                  {!reserved && committed > 0 && <p className="availability-note">{money(verified)} verified so far.</p>}
                  <div className="guest-gift-actions">
                    <button className="button button-outline button-wide" disabled={unavailable || committed > 0} onClick={() => {
                      onChooseGift(gift.id);
                      navigate("reserve-gift");
                    }}>{reserved ? "Reserved" : committed > 0 ? "Contributions started" : "Reserve this gift"}</button>
                    <button className="text-button card-link" disabled={unavailable} onClick={() => {
                      onChooseGift(gift.id);
                      navigate("contribute");
                    }}>{reserved ? "Already reserved" : remaining === 0 ? "Fully contributed" : "Contribute any amount"} <span aria-hidden="true">→</span></button>
                  </div>
                </div>
              </article>
              );
            })}
          </div>
        ) : (
          <div className="empty-list public-empty"><p>This couple has not added gifts yet.</p></div>
        )}
        <p className="registry-thanks">Thank you for being part of our story. <span>♡</span></p>
      </section>
    </>
  );
}

function ReserveGift({
  registry,
  gift,
  activities,
  remoteMode,
  onSubmit,
}: {
  registry: Registry;
  gift: Gift | null;
  activities: GuestActivity[];
  remoteMode: boolean;
  onSubmit: (gift: Gift, guestName: string, contact: string) => void | Promise<void>;
}) {
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const productUrl = gift ? getExternalUrl(gift.link) : null;
  const giftActivities = activities.filter((activity) =>
    activity.registryId === registry.id && activity.giftId === gift?.id &&
    ["reserved", "pledged", "payment_reported", "verified"].includes(activity.status)
  );
  const hasReservation = remoteMode
    ? gift?.isReserved === true
    : giftActivities.some((activity) => activity.kind === "reservation" && activity.status === "reserved");
  const hasContributions = remoteMode
    ? (gift?.committedAmount ?? 0) > 0
    : giftActivities.some((activity) => activity.kind === "contribution");
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!gift) {
      setError("This registry has no gifts available yet.");
      return;
    }
    if (hasReservation || hasContributions) {
      setError(hasReservation
        ? "This gift has already been reserved."
        : "Contributions have started, so this gift can no longer be reserved in full.");
      return;
    }
    const form = new FormData(event.currentTarget);
    const guestName = String(form.get("guestName") ?? "").trim();
    const contact = String(form.get("contact") ?? "").trim();
    if (!guestName || !isValidGuestContact(contact)) {
      setError("Enter your name and a valid email address or phone number.");
      return;
    }
    setError("");
    const request = onSubmit(gift, guestName, contact);
    if (remoteMode) {
      setSaving(true);
      void Promise.resolve(request)
        .catch((submitError: unknown) => {
          setError(submitError instanceof Error ? submitError.message : "Could not reserve this gift. Please try again.");
        })
        .finally(() => setSaving(false));
    }
  };

  return (
    <section className="form-page section-wrap">
      <div className="form-card form-card-wide">
        <PageIntro eyebrow={`${registryNames(registry)} · ${formatWeddingDate(registry.weddingDate)}`} title="A thoughtful choice." description={gift ? `You're reserving “${gift.name}”. Share your name so the couple knows who it's from.` : "Choose a gift from the registry before continuing."} />
        {gift && (
          <div className="selected-gift">
            <GiftImage gift={gift} className="selected-gift-artwork" />
            <div>
              <b>{gift.name}</b><small>{money(gift.price)}</small>
              {productUrl && <a className="product-link" href={productUrl} target="_blank" rel="noopener noreferrer">View gift online <span aria-hidden="true">↗</span></a>}
            </div>
          </div>
        )}
        {hasReservation && <p className="availability-note">This gift has already been reserved in full.</p>}
        {!hasReservation && hasContributions && <p className="availability-note">Contributions have started, so this gift can no longer be reserved in full.</p>}
        <form onSubmit={submit}>
          <label>Your name<input name="guestName" placeholder="Name the couple will recognize" autoComplete="name" required /></label>
          <label>Email or phone number<input name="contact" type="text" placeholder="you@example.com or +91 98765 43210" autoComplete="email" required /></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button-dark button-wide" type="submit" disabled={!gift || hasReservation || hasContributions || saving}>
            {saving ? "Reserving..." : hasReservation ? "Already reserved" : hasContributions ? "Contributions started" : "Reserve this gift"} <span aria-hidden="true">↗</span>
          </button>
        </form>
        <p className="form-footnote">The couple will see your name and contact details. They can release a reservation if needed.</p>
        <p className="form-footnote"><a href={getRegistryLink(registry)}>Back to the couple's wishlist</a></p>
        <p className="prototype-help">{remoteMode ? "Your reservation is saved securely, and the couple can see your name and contact details." : "Demo reservation is saved in this browser only."}</p>
      </div>
    </section>
  );
}

function Contribute({
  registry,
  gift,
  activities,
  remoteMode,
  onSubmit,
}: {
  registry: Registry;
  gift: Gift | null;
  activities: GuestActivity[];
  remoteMode: boolean;
  onSubmit: (gift: Gift, guestName: string, contact: string, amount: number) => void | Promise<void>;
}) {
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const productUrl = gift ? getExternalUrl(gift.link) : null;
  const giftActivities = activities.filter((activity) =>
    activity.registryId === registry.id && activity.giftId === gift?.id &&
    activity.kind === "contribution" && ["pledged", "payment_reported", "verified"].includes(activity.status)
  );
  const hasReservation = remoteMode
    ? gift?.isReserved === true
    : activities.some((activity) =>
      activity.registryId === registry.id && activity.giftId === gift?.id &&
      activity.kind === "reservation" && activity.status === "reserved"
    );
  const contributed = remoteMode
    ? gift?.verifiedAmount ?? 0
    : giftActivities
      .filter((activity) => activity.status === "verified")
      .reduce((total, activity) => total + activity.amount, 0);
  const committed = remoteMode
    ? gift?.committedAmount ?? 0
    : giftActivities.reduce((total, activity) => total + activity.amount, 0);
  const remaining = hasReservation ? 0 : Math.max(0, (gift?.price ?? 0) - committed);
  const paymentInstructions = registry.paymentInstructions;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!gift) {
      setError("This registry has no gifts available yet.");
      return;
    }
    if (hasReservation) {
      setError("This gift has already been reserved in full.");
      return;
    }
    const form = new FormData(event.currentTarget);
    const guestName = String(form.get("guestName") ?? "").trim();
    const contact = String(form.get("contact") ?? "").trim();
    const amount = Number(form.get("amount"));
    if (!guestName || !isValidGuestContact(contact) || !Number.isFinite(amount) || amount <= 0) {
      setError("Enter your name, a valid email address or phone number, and an amount greater than zero.");
      return;
    }
    if (committed + amount > gift.price) {
      setError("That amount is more than the remaining gift value.");
      return;
    }
    setError("");
    const request = onSubmit(gift, guestName, contact, amount);
    if (remoteMode) {
      setSaving(true);
      void Promise.resolve(request)
        .catch((submitError: unknown) => {
          setError(submitError instanceof Error ? submitError.message : "Could not create this contribution. Please try again.");
        })
        .finally(() => setSaving(false));
    }
  };

  return (
    <section className="form-page section-wrap">
      <div className="form-card form-card-wide">
        <PageIntro eyebrow={`${registryNames(registry)} · Shared contribution`} title="A little, together." description={gift ? `Contribute any amount toward “${gift.name}”. The total gift value is ${money(gift.price)}.` : "Choose a gift from the registry before continuing."} />
        {gift && (
          <div className="selected-gift">
            <GiftImage gift={gift} className="selected-gift-artwork" />
            <div>
              <b>{gift.name}</b><small>{money(gift.price)}</small>
              {productUrl && <a className="product-link" href={productUrl} target="_blank" rel="noopener noreferrer">View gift online <span aria-hidden="true">↗</span></a>}
            </div>
          </div>
        )}
        {hasReservation && <p className="availability-note">This gift has already been reserved in full.</p>}
        <div className="contribution-progress"><div className="progress-label"><span>{money(contributed)} verified</span><span>{money(remaining)} available</span></div><div className="progress-track"><span style={{ width: `${gift ? Math.min(100, (contributed / gift.price) * 100) : 0}%` }} /></div></div>
        <form onSubmit={submit}>
          <div className="field-row">
            <label>Your contribution amount<input name="amount" type="number" min="1" step="0.01" placeholder="e.g. 2,000" required /></label>
            <label>Your name<input name="guestName" placeholder="Name the couple will recognize" required /></label>
          </div>
          <label>Email or phone number<input name="contact" placeholder="Enter one contact method" autoComplete="email" required /></label>
          <div className="payment-instructions">
            <Eyebrow>PAY THE COUPLE OR FAMILY DIRECTLY</Eyebrow>
            <p>After pledging, use one of the payment options below. ShaadiLedger does not collect or process payment.</p>
            {paymentInstructions ? (
              <div className="status-summary">
                {paymentInstructions.payment_recipients.map((recipient) => (
                  <section className="guest-payment-recipient" key={recipient.id}>
                    <b>{recipient.display_name}</b>
                    <span>UPI ID</span>
                    <b>{recipient.upi_id}</b>
                    {recipient.qr_image_url && (
                      <img src={recipient.qr_image_url} alt={`${recipient.display_name} UPI QR code`} loading="lazy" />
                    )}
                  </section>
                ))}
                {paymentInstructions.bank_account_name && <><span>Account name</span><b>{paymentInstructions.bank_account_name}</b></>}
                {paymentInstructions.bank_account_number && <><span>Account number</span><b>{paymentInstructions.bank_account_number}</b></>}
                {paymentInstructions.bank_ifsc && <><span>IFSC</span><b>{paymentInstructions.bank_ifsc}</b></>}
                {paymentInstructions.cash_instructions && <><span>Cash</span><b>{paymentInstructions.cash_instructions}</b></>}
                {paymentInstructions.general_instructions && <><span>More details</span><b>{paymentInstructions.general_instructions}</b></>}
                {!paymentInstructions.payment_recipients.length && !paymentInstructions.bank_account_name && !paymentInstructions.bank_account_number &&
                  !paymentInstructions.cash_instructions && !paymentInstructions.general_instructions &&
                  <span>The couple has not added payment instructions yet. Please contact them before paying.</span>}
              </div>
            ) : <span>The couple has not added payment instructions yet. Please contact them before paying.</span>}
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button-dark button-wide" type="submit" disabled={!gift || hasReservation || remaining === 0 || saving}>
            {saving ? "Creating contribution..." : "Continue with contribution"} <span aria-hidden="true">↗</span>
          </button>
        </form>
        <p className="form-footnote"><a href={getRegistryLink(registry)}>Back to the couple's wishlist</a></p>
        <p className="prototype-help">{remoteMode ? "Only contributions verified by the couple count as received." : "Demo pledge is saved in this browser only. Only couple-verified contributions count as received."}</p>
      </div>
    </section>
  );
}

function GuestStatus({
  navigate,
  activity,
  registry,
  loading,
  error,
  remoteMode,
  onCopyLink,
  onCancelReservation,
  onReportPayment,
}: {
  navigate: Navigate;
  activity: GuestActivity | GuestActivityDetails | null;
  registry: Registry;
  loading: boolean;
  error: string;
  remoteMode: boolean;
  onCopyLink?: () => Promise<boolean>;
  onCancelReservation?: () => Promise<void>;
  onReportPayment?: () => Promise<void>;
}) {
  const [actionError, setActionError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const remoteActivity = activity && "giftName" in activity;
  const giftName = remoteActivity
    ? activity.giftName
    : activity ? registry.gifts.find((item) => item.id === activity.giftId)?.name ?? "Registry gift" : null;
  const coupleNames = remoteActivity ? activity.coupleNames : registryNames(registry);
  const amount = activity && "amount" in activity && typeof activity.amount === "number" ? activity.amount : null;
  const statusLabels: Record<GuestActivity["status"], string> = {
    reserved: "Reserved",
    cancelled: "Reservation cancelled",
    released: "Released",
    pledged: "Contribution pledged",
    payment_reported: "Payment reported",
    verified: "Verified",
    rejected: "Rejected",
    expired: "Expired",
  };
  const statusLabel = activity ? statusLabels[activity.status] : "";
  const canCancelReservation = remoteMode && activity?.kind === "reservation" && activity.status === "reserved";
  const canReportPayment = remoteMode && activity?.kind === "contribution" &&
    (activity.status === "pledged" || activity.status === "rejected");
  const performAction = (action: (() => Promise<void>) | undefined) => {
    if (!action) return;
    setActionError("");
    setActionLoading(true);
    void action()
      .catch((actionError: unknown) => {
        setActionError(actionError instanceof Error ? actionError.message : "This action could not be completed. Please try again.");
      })
      .finally(() => setActionLoading(false));
  };
  const copyPrivateLink = async () => {
    if (!onCopyLink) return;
    const copied = await onCopyLink();
    setLinkCopied(copied);
  };
  return (
    <section className="form-page section-wrap">
      <div className="form-card status-card">
        <span className="status-icon">♡</span>
        <Eyebrow>YOUR PRIVATE GUEST LINK</Eyebrow>
        <h1>Your gift, with love.</h1>
        <p className="status-description">{remoteMode
          ? "This private link lets you check or update the status of your gift without creating an account."
          : "This page shows the demo status for the gift you chose."}</p>
        {loading && <p role="status">Loading your secure guest status...</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        {activity ? (
          <div className="status-summary">
            <span>Gift</span><b>{giftName}</b>
            <span>Action</span><b className="status-pill">{statusLabel}</b>
            {amount !== null && <><span>Amount</span><b>{money(amount)}</b></>}
            {activity.kind === "contribution" && "expiresAt" in activity && activity.expiresAt &&
              <><span>Pledge expires</span><b>{new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(activity.expiresAt))}</b></>}
            {!remoteMode && activity && "guestName" in activity && <><span>Your name</span><b>{activity.guestName}</b></>}
          </div>
        ) : !loading && !error ? <p className="empty-list">No recent demo activity is available in this browser.</p> : null}
        {remoteMode && activity && (
          <>
            <p className="form-footnote">{coupleNames} can see your name and contact details. Any money is paid directly to the couple, outside ShaadiLedger.</p>
            {activity.kind === "contribution" && activity.status === "payment_reported" &&
              <p className="availability-note">Payment reported. The couple will update this status after checking their account.</p>}
            {activity.kind === "contribution" && activity.status === "verified" &&
              <p className="availability-note">The couple verified your contribution. Thank you!</p>}
            {canCancelReservation && <button className="button button-outline button-wide" disabled={actionLoading} onClick={() => performAction(onCancelReservation)}>
              {actionLoading ? "Cancelling..." : "Cancel this reservation"}
            </button>}
            {canReportPayment && <button className="button button-dark button-wide" disabled={actionLoading} onClick={() => performAction(onReportPayment)}>
              {actionLoading ? "Reporting..." : activity.status === "rejected" ? "Report payment again" : "I've paid — report payment"}
            </button>}
            {actionError && <p className="form-error" role="alert">{actionError}</p>}
            <button className="button button-outline button-wide" onClick={() => void copyPrivateLink()}>
              {linkCopied ? "Private link copied" : "Copy private status link"}
            </button>
            {linkCopied === false && <p className="form-footnote">Keep this link private; anyone with it can view this activity.</p>}
          </>
        )}
        {registry.slug && <button className="button button-outline button-wide" onClick={() => navigate(
          "public-registry",
          remoteMode ? `?slug=${encodeURIComponent(registry.slug)}` : "",
        )}>Back to their registry</button>}
        {!remoteMode && <p className="form-footnote">{registryNames(registry)} can see your name and contact details. Any money is paid directly to the couple, outside ShaadiLedger.</p>}
        {!remoteMode && <p className="prototype-help">Example reservation and contribution statuses are saved in this browser only.</p>}
      </div>
    </section>
  );
}

function Management({
  navigate,
  registry,
  activities,
  remoteMode,
  loading,
  error,
  onRetry,
  onReleaseReservation,
  onReleasePledge,
  onReviewContribution,
}: {
  navigate: Navigate;
  registry: Registry | null;
  activities: RegistryManagementActivity[];
  remoteMode: boolean;
  loading: boolean;
  error: string;
  onRetry: () => void;
  onReleaseReservation: (reservationId: string) => Promise<void>;
  onReleasePledge: (contributionId: string) => Promise<void>;
  onReviewContribution: (contributionId: string, decision: "verified" | "rejected", reason: string) => Promise<void>;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [rejectionReasons, setRejectionReasons] = useState<Record<string, string>>({});
  const reservations = activities.filter((activity) => activity.kind === "reservation");
  const contributions = activities.filter((activity) => activity.kind === "contribution");
  const pendingReports = contributions.filter((activity) => activity.status === "payment_reported");
  const pledges = contributions.filter((activity) =>
    activity.status === "pledged" && (!activity.expiresAt || new Date(activity.expiresAt).getTime() > Date.now())
  );
  const giftName = (giftId: string) => registry?.gifts.find((gift) => gift.id === giftId)?.name ?? "Registry gift";
  const contactDetails = (activity: RegistryManagementActivity) =>
    activity.email ?? activity.phone ?? "Contact unavailable";
  const runAction = (
    activityId: string,
    action: () => Promise<void>,
    confirmation: string,
  ) => {
    if (!window.confirm(confirmation)) return;
    setActionError("");
    setBusyId(activityId);
    void action()
      .catch((actionError: unknown) => {
        console.error("Could not update guest activity", actionError);
        setActionError(actionError instanceof Error ? actionError.message : "The activity could not be updated. Refresh and try again.");
      })
      .finally(() => setBusyId(null));
  };
  if (remoteMode && (!registry || loading || error)) {
    return (
      <section className="dashboard-page section-wrap">
        <PageIntro eyebrow="REGISTRY MANAGEMENT" title="A little love, coming in." description="Reservations and payment reports are visible to verified registry members only." />
        {!registry && !loading && <div className="empty-list"><p>Sign in and create a registry to review guest activity.</p></div>}
        {loading && <p role="status">Loading reservations and payment reports...</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        {error && registry && <button className="button button-outline" onClick={onRetry}>Reload activity</button>}
        <button className="text-button" onClick={() => navigate("dashboard")}>← Back to dashboard</button>
      </section>
    );
  }
  return (
    <section className="dashboard-page section-wrap">
      <PageIntro eyebrow="REGISTRY MANAGEMENT" title="A little love, coming in." description="Reservations and payment reports are visible to verified registry members only." />
      {remoteMode && (
        <div className="dashboard-actions">
          <span className="count-pill">{reservations.length} active reservations</span>
          <span className="count-pill">{pendingReports.length} payment reports</span>
          <span className="count-pill">{pledges.length} unpaid pledges</span>
        </div>
      )}
      <div className="dashboard-grid management-grid">
        <article className="panel">
          <div className="panel-heading"><div><Eyebrow>GIFT RESERVATIONS</Eyebrow><h2>Chosen with love</h2></div>{remoteMode && <span className="count-pill">{reservations.length} active</span>}</div>
          {remoteMode ? reservations.length ? reservations.map((activity) => (
            <div className="management-row" key={activity.id}>
              <span className="gift-thumb">♡</span>
              <span className="gift-row-copy">
                <b>{giftName(activity.giftId)}</b>
                <small>Reserved by {activity.guestName} · {contactDetails(activity)}</small>
                <small>{new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(activity.createdAt))}</small>
              </span>
              <button className="button button-outline button-small" disabled={busyId === activity.id} onClick={() => runAction(
                activity.id,
                () => onReleaseReservation(activity.id),
                `Release ${giftName(activity.giftId)} reserved by ${activity.guestName}? The gift will become available again.`,
              )}>{busyId === activity.id ? "Releasing..." : "Release"}</button>
            </div>
          )) : <div className="empty-list"><p>No active reservations.</p></div>
            : <>
              <div className="management-row"><span className="gift-thumb">🪑</span><span className="gift-row-copy"><b>A little reading nook</b><small>Reserved by Rohan · 2 days ago</small></span><button className="button button-outline button-small">Release</button></div>
              <div className="management-row"><span className="gift-thumb">🍽️</span><span className="gift-row-copy"><b>Dinnerware for two</b><small>Reserved by Meera · Yesterday</small></span><button className="button button-outline button-small">Release</button></div>
            </>}
        </article>
        <article className="panel">
          <div className="panel-heading"><div><Eyebrow>PAYMENT REPORTED</Eyebrow><h2>Ready for a check-in</h2></div>{remoteMode && <span className="count-pill">{pendingReports.length} to review</span>}</div>
          {remoteMode ? pendingReports.length ? pendingReports.map((activity) => (
            <div className="management-row" key={activity.id}>
              <span className="gift-thumb">♡</span>
              <span className="gift-row-copy">
                <b>{activity.guestName} · {money(activity.amount ?? 0)}</b>
                <small>{giftName(activity.giftId)} · {contactDetails(activity)}</small>
                <small>Reported {activity.paymentReportedAt
                  ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(activity.paymentReportedAt))
                  : new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(activity.createdAt))}</small>
                <label className="management-rejection-reason">Rejection note (optional)
                  <input value={rejectionReasons[activity.id] ?? ""} maxLength={500} onChange={(event) =>
                    setRejectionReasons((current) => ({ ...current, [activity.id]: event.target.value }))
                  } placeholder="Explain what the guest should check" />
                </label>
              </span>
              <div className="management-actions">
                <button className="button button-dark button-small" disabled={busyId === activity.id} onClick={() => runAction(
                  activity.id,
                  () => onReviewContribution(activity.id, "verified", ""),
                  `Confirm that you received ${money(activity.amount ?? 0)} from ${activity.guestName}?`,
                )}>{busyId === activity.id ? "Saving..." : "Verify"}</button>
                <button className="button button-outline button-small" disabled={busyId === activity.id} onClick={() => runAction(
                  activity.id,
                  () => onReviewContribution(activity.id, "rejected", rejectionReasons[activity.id] ?? ""),
                  `Reject this payment report from ${activity.guestName}? They will be able to report payment again.`,
                )}>Reject</button>
              </div>
            </div>
          )) : <div className="empty-list"><p>No payment reports need review.</p></div>
            : <>
              <div className="management-row"><span className="gift-thumb">🏝️</span><span className="gift-row-copy"><b>Ananya · ₹2,000</b><small>Weekend by the sea · Today</small></span><button className="text-button">Review →</button></div>
              <div className="management-row"><span className="gift-thumb">🏝️</span><span className="gift-row-copy"><b>Kabir · ₹5,000</b><small>Weekend by the sea · Yesterday</small></span><button className="text-button">Review →</button></div>
            </>}
        </article>
      </div>
      {remoteMode && (
        <article className="panel management-pledges">
          <div className="panel-heading"><div><Eyebrow>UNPAID PLEDGES</Eyebrow><h2>Waiting to be paid</h2></div><span className="count-pill">{pledges.length} active</span></div>
          {pledges.length ? pledges.map((activity) => (
            <div className="management-row" key={activity.id}>
              <span className="gift-thumb">♡</span>
              <span className="gift-row-copy"><b>{activity.guestName} · {money(activity.amount ?? 0)}</b>
                <small>{giftName(activity.giftId)} · {contactDetails(activity)}</small>
                <small>{activity.expiresAt
                  ? `Pledge expires ${new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(activity.expiresAt))}`
                  : "Pledge expiry unavailable"}</small>
              </span>
              <button className="button button-outline button-small" disabled={busyId === activity.id} onClick={() => runAction(
                activity.id,
                () => onReleasePledge(activity.id),
                `Release ${money(activity.amount ?? 0)} pledged by ${activity.guestName}? This will free the amount for other guests.`,
              )}>{busyId === activity.id ? "Releasing..." : "Release pledge"}</button>
            </div>
          )) : <div className="empty-list"><p>No unpaid pledges are currently holding capacity.</p></div>}
        </article>
      )}
      {actionError && <p className="form-error" role="alert">{actionError}</p>}
      <div className="notice-card"><span>✳</span><p>Verifying a report updates the collected total. If you reject it, the guest can report the payment again.</p></div>
      <button className="text-button" onClick={() => navigate("dashboard")}>← Back to dashboard</button>
      <p className="prototype-help">{remoteMode ? "Actions are recorded in the registry activity log. Payment proof is not collected." : "Demo management actions are not connected. Payment proof is not collected."}</p>
    </section>
  );
}

export default App;
