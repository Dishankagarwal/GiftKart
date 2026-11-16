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

  it("loads owner categories and active gifts in persisted priority order", async () => {
    const registryRow = {
      id: "registry-id",
      owner_id: "owner-id",
      couple_names: "Maya & Neel",
      wedding_date: null,
      city: null,
      welcome_message: "",
      public_slug: "maya-neel",
      is_published: true,
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(authSession))
      .mockResolvedValueOnce(jsonResponse([registryRow]))
      .mockResolvedValueOnce(jsonResponse([{ id: "category-id", name: "For our home", sort_order: 0 }]))
      .mockResolvedValueOnce(jsonResponse([
        {
          id: "gift-1",
          category_id: "category-id",
          name: "A reading chair",
          description: "For slow mornings",
          target_amount: "12500.00",
          external_url: "https://shop.example.test/chair",
          sort_order: 0,
        },
      ]));
    vi.stubGlobal("fetch", fetchMock);
    const { signIn, getOwnedRegistry } = await import("./supabase");
    const session = await signIn("couple@example.com", "password-123");

    const result = await getOwnedRegistry(session);

    expect(result.registry?.categories).toEqual(["For our home"]);
    expect(result.registry?.gifts).toEqual([{
      id: "gift-1",
      category: "For our home",
      name: "A reading chair",
      description: "For slow mornings",
      price: 12500,
      link: "https://shop.example.test/chair",
      priority: 1,
    }]);
    expect(fetchMock.mock.calls[2][0]).toContain("/rest/v1/gift_categories?");
    expect(fetchMock.mock.calls[3][0]).toContain("order=sort_order.asc,created_at.asc,id.asc");
    expect(fetchMock.mock.calls[3][0]).toContain("is_active=eq.true");
  });

  it("saves a gift and its complete priority order through the protected atomic RPCs", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(authSession))
      .mockResolvedValueOnce(jsonResponse("gift-2"))
      .mockResolvedValueOnce(jsonResponse(null));
    vi.stubGlobal("fetch", fetchMock);
    const { signIn, saveRegistryGift, reorderRegistryGifts } = await import("./supabase");
    const session = await signIn("couple@example.com", "password-123");
    const gift = {
      id: "gift-2",
      category: "A new category",
      name: "A garden table",
      description: "For long dinners",
      price: 24000,
      link: "https://shop.example.test/table",
      priority: 1,
    };

    await saveRegistryGift(session, "registry-id", gift, ["gift-2", "gift-1"]);
    await reorderRegistryGifts(session, "registry-id", ["gift-1", "gift-2"]);

    expect(fetchMock.mock.calls[1][0]).toBe("https://wedding-project.supabase.co/rest/v1/rpc/save_registry_gift");
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
      p_registry_id: "registry-id",
      p_gift_id: "gift-2",
      p_name: "A garden table",
      p_description: "For long dinners",
      p_target_amount: 24000,
      p_external_url: "https://shop.example.test/table",
      p_category_name: "A new category",
      p_gift_ids: ["gift-2", "gift-1"],
    });
    expect(fetchMock.mock.calls[2][0]).toBe("https://wedding-project.supabase.co/rest/v1/rpc/reorder_registry_gifts");
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body))).toEqual({
      p_registry_id: "registry-id",
      p_gift_ids: ["gift-1", "gift-2"],
    });
  });

  it("loads only actionable registry activities and joins private guest contact details", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(authSession))
      .mockResolvedValueOnce(jsonResponse([
        {
          id: "reservation-id",
          gift_id: "gift-1",
          guest_id: "guest-1",
          status: "reserved",
          created_at: "2026-11-15T10:00:00Z",
        },
      ]))
      .mockResolvedValueOnce(jsonResponse([
        {
          id: "contribution-id",
          gift_id: "gift-2",
          guest_id: "guest-2",
          amount: "2500.00",
          status: "payment_reported",
          created_at: "2026-11-15T11:00:00Z",
          payment_reported_at: "2026-11-15T12:00:00Z",
          expires_at: null,
        },
      ]))
      .mockResolvedValueOnce(jsonResponse([
        { id: "guest-1", name: "Rohan", email: "rohan@example.com", phone: null },
        { id: "guest-2", name: "Meera", email: null, phone: "+919876543210" },
      ]));
    vi.stubGlobal("fetch", fetchMock);
    const { signIn, getRegistryManagementActivities } = await import("./supabase");
    const session = await signIn("couple@example.com", "password-123");

    const result = await getRegistryManagementActivities(session, "registry-id");

    expect(result.activities).toEqual([
      {
        id: "reservation-id",
        kind: "reservation",
        giftId: "gift-1",
        guestName: "Rohan",
        email: "rohan@example.com",
        phone: null,
        amount: null,
        status: "reserved",
        createdAt: "2026-11-15T10:00:00Z",
        paymentReportedAt: null,
        expiresAt: null,
      },
      {
        id: "contribution-id",
        kind: "contribution",
        giftId: "gift-2",
        guestName: "Meera",
        email: null,
        phone: "+919876543210",
        amount: 2500,
        status: "payment_reported",
        createdAt: "2026-11-15T11:00:00Z",
        paymentReportedAt: "2026-11-15T12:00:00Z",
        expiresAt: null,
      },
    ]);
    expect(fetchMock.mock.calls[1][0]).toContain("reservations?");
    expect(fetchMock.mock.calls[2][0]).toContain("status=in.(pledged,payment_reported)");
    expect(fetchMock.mock.calls[3][0]).toContain("id=in.(guest-1,guest-2)");
  });

  it("uses authenticated protected RPCs for member release and payment decisions", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(authSession))
      .mockResolvedValueOnce(jsonResponse(true))
      .mockResolvedValueOnce(jsonResponse(true))
      .mockResolvedValueOnce(jsonResponse(true));
    vi.stubGlobal("fetch", fetchMock);
    const {
      signIn,
      releaseRegistryReservation,
      releaseRegistryPledge,
      reviewRegistryContribution,
    } = await import("./supabase");
    const session = await signIn("couple@example.com", "password-123");

    await releaseRegistryReservation(session, "reservation-id");
    await releaseRegistryPledge(session, "pledge-id");
    await reviewRegistryContribution(session, "contribution-id", "rejected", "Please check your transfer reference.");

    expect(fetchMock.mock.calls.slice(1).map(([url]) => url)).toEqual([
      "https://wedding-project.supabase.co/rest/v1/rpc/release_reservation",
      "https://wedding-project.supabase.co/rest/v1/rpc/release_unpaid_pledge",
      "https://wedding-project.supabase.co/rest/v1/rpc/review_contribution",
    ]);
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({ p_reservation_id: "reservation-id" });
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body))).toEqual({ p_contribution_id: "pledge-id" });
    expect(JSON.parse(String(fetchMock.mock.calls[3][1]?.body))).toEqual({
      p_contribution_id: "contribution-id",
      p_decision: "rejected",
      p_rejection_reason: "Please check your transfer reference.",
    });
  });

  it("surfaces stale or unauthorized member actions when a protected RPC returns false", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(authSession))
      .mockResolvedValueOnce(jsonResponse(false));
    vi.stubGlobal("fetch", fetchMock);
    const { signIn, releaseRegistryReservation } = await import("./supabase");
    const session = await signIn("couple@example.com", "password-123");

    await expect(releaseRegistryReservation(session, "reservation-id"))
      .rejects.toThrow("This reservation is no longer active. Refresh the activity list.");
  });

  it("loads saved payment settings for a registry and returns empty values when none exist", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(authSession))
      .mockResolvedValueOnce(jsonResponse([{
        bank_account_name: "Maya Sharma",
        bank_account_number: "1234567890",
        bank_ifsc: "ABCD0123456",
        cash_instructions: null,
        general_instructions: "Mention the wedding gift.",
      }]))
      .mockResolvedValueOnce(jsonResponse([{
        id: "recipient-id",
        display_name: "Maya",
        upi_id: "maya@exampleupi",
        qr_image_path: null,
        sort_order: 0,
      }]))
      .mockResolvedValueOnce(jsonResponse([]));
    fetchMock.mockResolvedValueOnce(jsonResponse([]));
    vi.stubGlobal("fetch", fetchMock);
    const { signIn, getRegistryPaymentSettings } = await import("./supabase");
    const session = await signIn("couple@example.com", "password-123");

    const saved = await getRegistryPaymentSettings(session, "registry-id");
    const empty = await getRegistryPaymentSettings(saved.session, "empty-registry-id");

    expect(saved.settings).toEqual({
      recipients: [{
        id: "recipient-id",
        displayName: "Maya",
        upiId: "maya@exampleupi",
        qrImagePath: null,
        qrImageUrl: null,
      }],
      bankAccountName: "Maya Sharma",
      bankAccountNumber: "1234567890",
      bankIfsc: "ABCD0123456",
      cashInstructions: "",
      generalInstructions: "Mention the wedding gift.",
    });
    expect(empty.settings).toEqual({
      recipients: [],
      bankAccountName: "",
      bankAccountNumber: "",
      bankIfsc: "",
      cashInstructions: "",
      generalInstructions: "",
    });
    expect(fetchMock.mock.calls[1][0]).toContain("/rest/v1/payment_settings?");
    expect(fetchMock.mock.calls[2][0]).toContain("/rest/v1/registry_payment_recipients?");
  });

  it("saves payment instructions and multiple recipients atomically through the protected RPC", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(authSession))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse(null))
      .mockResolvedValueOnce(jsonResponse([{
        bank_account_name: null,
        bank_account_number: null,
        bank_ifsc: null,
        cash_instructions: null,
        general_instructions: "Use the wedding as the reference.",
      }]))
      .mockResolvedValueOnce(jsonResponse([{
        id: "recipient-id",
        display_name: "Maya",
        upi_id: "maya@exampleupi",
        qr_image_path: null,
        sort_order: 0,
      }]));
    vi.stubGlobal("fetch", fetchMock);
    const { signIn, saveRegistryPaymentSettings } = await import("./supabase");
    const session = await signIn("couple@example.com", "password-123");

    const result = await saveRegistryPaymentSettings(session, "registry-id", {
      recipients: [{
        id: "recipient-id",
        displayName: " Maya ",
        upiId: " maya@exampleupi ",
        qrImagePath: null,
        qrImageUrl: null,
      }],
      bankAccountName: "",
      bankAccountNumber: "",
      bankIfsc: "",
      cashInstructions: "",
      generalInstructions: " Use the wedding as the reference. ",
    });

    expect(fetchMock.mock.calls[3][0]).toBe("https://wedding-project.supabase.co/rest/v1/rpc/save_registry_payment_settings");
    const request = fetchMock.mock.calls[3][1] as RequestInit;
    expect(request.method).toBe("POST");
    expect(JSON.parse(String(request.body))).toEqual({
      p_registry_id: "registry-id",
      p_settings: {
        bank_account_name: null,
        bank_account_number: null,
        bank_ifsc: null,
        cash_instructions: null,
        general_instructions: "Use the wedding as the reference.",
      },
      p_recipients: [{
        id: "recipient-id",
        display_name: "Maya",
        upi_id: "maya@exampleupi",
        qr_image_path: null,
      }],
    });
    expect(result.settings.recipients[0].upiId).toBe("maya@exampleupi");
  });
});
