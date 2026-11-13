import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authSession = {
  access_token: "access-token",
  refresh_token: "refresh-token",
  expires_in: 3600,
  user: { id: "owner-id", email: "couple@example.com" },
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("VITE_SUPABASE_URL", "https://wedding-project.supabase.co");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "public-anon-key");
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("Supabase account and registry integration", () => {
  it("creates an Auth account without persisting a session when email confirmation is pending", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ user: authSession.user }));
    vi.stubGlobal("fetch", fetchMock);
    const { signUp } = await import("./supabase");

    const session = await signUp("couple@example.com", "password-123");

    expect(session).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://wedding-project.supabase.co/auth/v1/signup",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ email: "couple@example.com", password: "password-123" }),
      }),
    );
    expect(window.localStorage.length).toBe(0);
  });

  it("saves a registry using the signed-in owner's identity and returns the persisted row", async () => {
    const registryRow = {
      id: "registry-id",
      owner_id: "owner-id",
      couple_names: "Maya & Neel",
      wedding_date: "2027-09-12",
      city: "Pune",
      welcome_message: "Celebrate with us.",
      public_slug: "maya-neel",
      is_published: false,
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(authSession))
      .mockResolvedValueOnce(jsonResponse([registryRow]));
    vi.stubGlobal("fetch", fetchMock);
    const { signIn, saveRegistry } = await import("./supabase");
    const session = await signIn("couple@example.com", "password-123");

    const result = await saveRegistry(session, {
      slug: "maya-neel",
      firstName: "Maya",
      partnerName: "Neel",
      weddingDate: "2027-09-12",
      city: "Pune",
      welcomeMessage: "Celebrate with us.",
    }, null);

    const request = fetchMock.mock.calls[1][1] as RequestInit;
    expect(fetchMock.mock.calls[1][0]).toBe("https://wedding-project.supabase.co/rest/v1/registries");
    expect(JSON.parse(String(request.body))).toEqual({
      couple_names: "Maya & Neel",
      wedding_date: "2027-09-12",
      city: "Pune",
      welcome_message: "Celebrate with us.",
      public_slug: "maya-neel",
      owner_id: "owner-id",
    });
    expect(result.registry).toMatchObject({
      id: "registry-id",
      ownerId: "owner-id",
      ownerEmail: "couple@example.com",
      firstName: "Maya",
      partnerName: "Neel",
      isPublished: false,
    });
  });
});
