import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

const screens = [
  ["landing", "Landing page", /Gifts that feel/i],
  ["login", "Couple sign in", /Your registry awaits/i],
  ["create-account", "Couple registration", /Create your account/i],
  ["create-registry", "Create registry", /Let's make it yours/i],
  ["dashboard", "Couple dashboard", /Your registry is waiting/i],
  ["edit-gift", "Add / edit gift", /Add a little wish/i],
  ["public-registry", "Public wishlist", /Aarav.*Priya/i],
  ["reserve-gift", "Reserve a gift", /A thoughtful choice/i],
  ["contribute", "Group contribution", /A little, together/i],
  ["guest-status", "Guest status", /Your gift, with love/i],
  ["management", "Gift management", /A little love, coming in/i],
] as const;

beforeEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  window.history.replaceState(null, "", `${window.location.origin}${window.location.pathname}#landing`);
  window.localStorage.clear();
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  let uuid = 0;
  vi.stubGlobal("crypto", {
    randomUUID: () => `test-uuid-${++uuid}`,
    getRandomValues: (value: Uint8Array) => {
      value.fill(7);
      return value;
    },
    subtle: {
      importKey: vi.fn().mockResolvedValue({}),
      deriveBits: vi.fn().mockResolvedValue(new ArrayBuffer(32)),
    },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function createRegistry({
  firstName = "Maya",
  partnerName = "Neel",
  email = "maya@example.com",
  password = "wedding-password",
}: {
  firstName?: string;
  partnerName?: string;
  email?: string;
  password?: string;
} = {}) {
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: /Create your registry/i }));
  fireEvent.change(screen.getByLabelText("Email address"), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: /Continue to registry details/i }));

  await screen.findByRole("heading", { name: /Let's make it yours/i });
  fireEvent.change(screen.getByLabelText("Your name"), { target: { value: firstName } });
  fireEvent.change(screen.getByLabelText("Your partner's name"), { target: { value: partnerName } });
  fireEvent.change(screen.getByLabelText("Wedding date"), { target: { value: "2027-09-12" } });
  fireEvent.change(screen.getByLabelText("City"), { target: { value: "Pune" } });
  fireEvent.change(screen.getByLabelText(/A welcome note/i), { target: { value: "We cannot wait to celebrate with you." } });
  fireEvent.click(screen.getByRole("button", { name: /Save registry and continue/i }));
  await screen.findByRole("heading", { name: new RegExp(`${firstName}.*${partnerName}`) });
}

describe("ShaadiLedger registry flows", () => {
  it("shows a clear preview notice on the landing page", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: /Gifts that feel/i })).toBeTruthy();
    expect(screen.getByText(/Changes are saved only in this browser/i)).toBeTruthy();
  });

  it.each(screens)("navigates to the %s screen", (route, label, heading) => {
    render(<App />);
    fireEvent.click(screen.getByText("Explore prototype screens"));
    if (route === "login") {
      fireEvent.click(within(screen.getByRole("navigation", { name: "Main navigation" })).getByRole("button", { name: label }));
    } else {
      fireEvent.click(screen.getByRole("button", { name: label }));
    }

    expect(window.location.hash).toBe(`#${route}`);
    expect(screen.getByRole("heading", { name: heading })).toBeTruthy();
  });

  it("creates and saves a registry using the names and details entered", async () => {
    await createRegistry({ firstName: "Riya", partnerName: "Kabir" });

    expect(screen.getByRole("heading", { name: /Riya.*Kabir/i })).toBeTruthy();
    expect(screen.getByText(/12 September 2027.*Pune/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Your dashboard" })).toBeTruthy();
    expect(JSON.parse(window.localStorage.getItem("shaadiledger.demo.v1") ?? "{}").registries[0].firstName).toBe("Riya");
  });

  it("adds a gift without asking the couple to choose reservation or contribution type", async () => {
    await createRegistry();
    fireEvent.click(screen.getByRole("button", { name: /Add a gift/i }));
    expect(screen.getByRole("heading", { name: /Add a little wish/i })).toBeTruthy();
    expect(screen.queryByLabelText(/Gift type/i)).toBeNull();

    fireEvent.change(screen.getByLabelText("Gift name"), { target: { value: "A garden table" } });
    fireEvent.change(screen.getByLabelText("What makes it special? (optional)"), { target: { value: "For long dinners" } });
    fireEvent.change(screen.getByLabelText("Gift value"), { target: { value: "12500" } });
    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "For our home" } });
    fireEvent.click(screen.getByRole("button", { name: /Add gift to wishlist/i }));

    expect(await screen.findByText("A garden table")).toBeTruthy();
    expect(screen.getByText("₹12,500")).toBeTruthy();
    expect(JSON.parse(window.localStorage.getItem("shaadiledger.demo.v1") ?? "{}").registries[0].gifts).toHaveLength(1);
  });

  it("uses the product site's icon and gift priority in the dashboard and public wishlist", async () => {
    await createRegistry();
    const addGift = (name: string, priority: string, link = "") => {
      fireEvent.click(screen.getByRole("button", { name: /Add a gift/i }));
      fireEvent.change(screen.getByLabelText("Gift name"), { target: { value: name } });
      fireEvent.change(screen.getByLabelText("Gift value"), { target: { value: "5000" } });
      fireEvent.change(screen.getByLabelText("Wishlist priority"), { target: { value: priority } });
      if (link) fireEvent.change(screen.getByLabelText("Product link (optional)"), { target: { value: link } });
      fireEvent.click(screen.getByRole("button", { name: /Add gift to wishlist/i }));
    };

    addGift("Second choice", "1");
    addGift("Top choice", "1", "https://shop.example.test/top-choice");
    const savedGifts = JSON.parse(window.localStorage.getItem("shaadiledger.demo.v1") ?? "{}").registries[0].gifts;
    expect(savedGifts.map((gift: { name: string; priority: number }) => [gift.name, gift.priority])).toEqual([
      ["Top choice", 1],
      ["Second choice", 2],
    ]);

    fireEvent.click(screen.getByRole("button", { name: /Preview registry/i }));
    expect(screen.getByRole("img", { name: "Top choice" }).getAttribute("src")).toBe("https://shop.example.test/favicon.ico");
    expect(screen.getByRole("link", { name: /View gift online/i }).getAttribute("href")).toBe("https://shop.example.test/top-choice");
    const firstGift = screen.getByRole("heading", { name: "Top choice" });
    const secondGift = screen.getByRole("heading", { name: "Second choice" });
    expect(firstGift.compareDocumentPosition(secondGift) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const topChoiceCard = firstGift.closest("article");
    if (!topChoiceCard) throw new Error("Top choice gift card was not rendered.");
    fireEvent.click(within(topChoiceCard).getByRole("button", { name: /Reserve this gift/i }));
    expect(screen.getByRole("link", { name: /View gift online/i }).getAttribute("href")).toBe("https://shop.example.test/top-choice");
    expect(screen.getByRole("link", { name: /Back to the couple's wishlist/i })).toBeTruthy();
  });

  it("lets a couple edit an existing gift's product URL", async () => {
    await createRegistry();
    fireEvent.click(screen.getByRole("button", { name: /Add a gift/i }));
    fireEvent.change(screen.getByLabelText("Gift name"), { target: { value: "A lamp" } });
    fireEvent.change(screen.getByLabelText("Gift value"), { target: { value: "4000" } });
    fireEvent.click(screen.getByRole("button", { name: /Add gift to wishlist/i }));

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("heading", { name: /Edit your wish/i })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Product link (optional)"), { target: { value: "https://shop.example.test/lamp" } });
    fireEvent.click(screen.getByRole("button", { name: /Save gift changes/i }));

    const savedGift = JSON.parse(window.localStorage.getItem("shaadiledger.demo.v1") ?? "{}").registries[0].gifts[0];
    expect(savedGift.name).toBe("A lamp");
    expect(savedGift.link).toBe("https://shop.example.test/lamp");
    expect(JSON.parse(window.localStorage.getItem("shaadiledger.demo.v1") ?? "{}").registries[0].gifts).toHaveLength(1);
  });

  it("lets a guest choose reservation or contribution on the public gift", async () => {
    await createRegistry();
    fireEvent.click(screen.getByRole("button", { name: /Add a gift/i }));
    fireEvent.change(screen.getByLabelText("Gift name"), { target: { value: "Our first sofa" } });
    fireEvent.change(screen.getByLabelText("Gift value"), { target: { value: "25000" } });
    fireEvent.click(screen.getByRole("button", { name: /Add gift to wishlist/i }));
    fireEvent.click(screen.getByRole("button", { name: /Preview registry/i }));

    expect(screen.getByRole("button", { name: /Reserve this gift/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Contribute any amount/i })).toBeTruthy();
  });

  it("does not allow contributions after a guest reserves the full gift", async () => {
    await createRegistry();
    fireEvent.click(screen.getByRole("button", { name: /Add a gift/i }));
    fireEvent.change(screen.getByLabelText("Gift name"), { target: { value: "A garden table" } });
    fireEvent.change(screen.getByLabelText("Gift value"), { target: { value: "12500" } });
    fireEvent.click(screen.getByRole("button", { name: /Add gift to wishlist/i }));
    fireEvent.click(screen.getByRole("button", { name: /Preview registry/i }));
    fireEvent.click(screen.getByRole("button", { name: /Reserve this gift/i }));
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Rohan" } });
    fireEvent.change(screen.getByLabelText("Email or phone number"), { target: { value: "9876543210" } });
    fireEvent.click(screen.getByRole("button", { name: "Reserve this gift" }));
    fireEvent.click(screen.getByRole("button", { name: "Back to their registry" }));

    expect(screen.getByRole("button", { name: "Reserved" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Already reserved" }).hasAttribute("disabled")).toBe(true);
  });

  it("allows additional contributions but not a full reservation after contributions begin", async () => {
    await createRegistry();
    fireEvent.click(screen.getByRole("button", { name: /Add a gift/i }));
    fireEvent.change(screen.getByLabelText("Gift name"), { target: { value: "A garden table" } });
    fireEvent.change(screen.getByLabelText("Gift value"), { target: { value: "12500" } });
    fireEvent.click(screen.getByRole("button", { name: /Add gift to wishlist/i }));
    fireEvent.click(screen.getByRole("button", { name: /Preview registry/i }));
    fireEvent.click(screen.getByRole("button", { name: /Contribute any amount/i }));
    fireEvent.change(screen.getByLabelText("Your contribution amount"), { target: { value: "2500" } });
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Meera" } });
    fireEvent.change(screen.getByLabelText("Email or phone number"), { target: { value: "meera@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /Continue with contribution/i }));
    fireEvent.click(screen.getByRole("button", { name: "Back to their registry" }));

    expect(screen.getByRole("button", { name: "Contributions started" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: /Contribute any amount/i }).hasAttribute("disabled")).toBe(false);
    expect(screen.getByText("₹10,000 remaining for contributions.")).toBeTruthy();
  });

  it("copies the public link and keeps the couple signed in after returning to the site", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    await createRegistry();
    fireEvent.click(screen.getByRole("button", { name: /Copy link/i }));
    expect(await screen.findByText("Link copied!")).toBeTruthy();
    expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/#public-registry\?slug=maya-neel/));

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    const navigation = within(screen.getByRole("navigation", { name: "Main navigation" }));
    expect(navigation.getByRole("button", { name: /Couple sign in/i })).toBeTruthy();
    fireEvent.click(navigation.getByRole("button", { name: /Couple sign in/i }));
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "maya@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "wedding-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("heading", { name: /Maya.*Neel/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Your dashboard" })).toBeTruthy();
  });

  it("opens the couple's saved registry from its shared URL instead of the sample registry", async () => {
    await createRegistry({ firstName: "Riya", partnerName: "Kabir" });
    window.location.hash = "public-registry?slug=riya-kabir";

    expect(await screen.findByRole("heading", { name: /Riya.*Kabir/i })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: /Aarav.*Priya/i })).toBeNull();
  });

  it("takes a guest through an actual demo reservation", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("link", { name: "Find a registry" }));
    fireEvent.click(screen.getAllByRole("button", { name: /Reserve this gift/i })[0]);
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Rohan" } });
    const contact = screen.getByLabelText("Email or phone number");
    fireEvent.change(contact, { target: { value: "not-a-contact" } });
    fireEvent.click(screen.getByRole("button", { name: "Reserve this gift" }));
    expect(screen.getByRole("alert").textContent).toMatch(/valid email address or phone number/i);

    fireEvent.change(contact, { target: { value: "rohan@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Reserve this gift" }));

    expect(screen.getByRole("heading", { name: /Your gift, with love/i })).toBeTruthy();
    expect(screen.getByText("Rohan")).toBeTruthy();
    expect(screen.getByText("Reserved")).toBeTruthy();
  });

  it("takes a guest through an actual demo contribution", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("link", { name: "Find a registry" }));
    fireEvent.click(screen.getAllByRole("button", { name: /Contribute any amount/i })[0]);
    fireEvent.change(screen.getByLabelText("Your contribution amount"), { target: { value: "2000" } });
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Meera" } });
    fireEvent.change(screen.getByLabelText("Email or phone number"), { target: { value: "meera@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /Continue with contribution/i }));

    expect(screen.getByRole("heading", { name: /Your gift, with love/i })).toBeTruthy();
    expect(screen.getByText("₹2,000")).toBeTruthy();
    expect(screen.getByText("Contribution pledged")).toBeTruthy();
  });

  it("shows a working product link and wishlist return link on the contribution page", async () => {
    await createRegistry();
    fireEvent.click(screen.getByRole("button", { name: /Add a gift/i }));
    fireEvent.change(screen.getByLabelText("Gift name"), { target: { value: "A lamp" } });
    fireEvent.change(screen.getByLabelText("Gift value"), { target: { value: "4000" } });
    fireEvent.change(screen.getByLabelText("Product link (optional)"), { target: { value: "https://shop.example.test/lamp" } });
    fireEvent.click(screen.getByRole("button", { name: /Add gift to wishlist/i }));
    fireEvent.click(screen.getByRole("button", { name: /Preview registry/i }));
    fireEvent.click(screen.getByRole("button", { name: /Contribute any amount/i }));

    expect(screen.getByRole("link", { name: /View gift online/i }).getAttribute("href")).toBe("https://shop.example.test/lamp");
    expect(screen.getByRole("link", { name: /Back to the couple's wishlist/i }).getAttribute("href")).toContain("#public-registry?slug=maya-neel");
  });

  it("shows gift management from the prototype menu", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Explore prototype screens"));
    fireEvent.click(screen.getByRole("button", { name: "Gift management" }));

    expect(screen.getByRole("heading", { name: /A little love, coming in/i })).toBeTruthy();
    expect(screen.getByText(/Payment proof is not collected/i)).toBeTruthy();
  });

  it("saves gifts, categories, and priority through Supabase and displays the public wishlist", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "local-anon-key");
    const newGiftId = "b0000000-0000-4000-8000-000000000002";
    const oldGiftId = "b0000000-0000-4000-8000-000000000001";
    const registryRow = {
      id: "registry-id",
      owner_id: "owner-id",
      couple_names: "Maya & Neel",
      wedding_date: "2027-09-12",
      city: "Pune",
      welcome_message: "Celebrate with us.",
      public_slug: "maya-neel",
      is_published: true,
    };
    const databaseGifts: Array<{
      id: string;
      category_id: string;
      name: string;
      description: string;
      target_amount: string;
      external_url: string | null;
      sort_order: number;
    }> = [
      {
        id: oldGiftId,
        category_id: "category-home",
        name: "A reading chair",
        description: "For slow mornings",
        target_amount: "12500.00",
        external_url: "https://shop.example.test/chair",
        sort_order: 0,
      },
    ];
    const publicGifts: Array<{
      id: string;
      name: string;
      description: string;
      target_amount: number;
      external_url: string | null;
      category: string;
      committed_amount: number;
      verified_amount: number;
      is_reserved: boolean;
    }> = [
      {
        id: oldGiftId,
        name: "A reading chair",
        description: "For slow mornings",
        target_amount: 12500,
        external_url: "https://shop.example.test/chair",
        category: "For our home",
        committed_amount: 0,
        verified_amount: 0,
        is_reserved: false,
      },
    ];
    const paymentSettings = {
      bank_account_name: null,
      bank_account_number: null,
      bank_ifsc: null,
      cash_instructions: null,
      general_instructions: "",
    };
    const paymentRecipients = [{
      id: "recipient-id",
      display_name: "Maya",
      upi_id: "maya@exampleupi",
      qr_image_path: null,
    }];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === "/rest/v1/registries") return new Response(JSON.stringify([registryRow]), { status: 200 });
      if (url.pathname === "/rest/v1/gift_categories") {
        return new Response(JSON.stringify([{ id: "category-home", name: "For our home", sort_order: 0 }]), { status: 200 });
      }
      if (url.pathname === "/rest/v1/gifts") return new Response(JSON.stringify(databaseGifts), { status: 200 });
      if (url.pathname === "/rest/v1/payment_settings") {
        return new Response(JSON.stringify([paymentSettings]), { status: 200 });
      }
      if (url.pathname === "/rest/v1/registry_payment_recipients") {
        return new Response(JSON.stringify(paymentRecipients.map((recipient, sort_order) => ({ ...recipient, sort_order }))), { status: 200 });
      }
      if (url.pathname === "/rest/v1/rpc/save_registry_gift") {
        const request = JSON.parse(String(init?.body)) as { p_gift_ids: string[]; p_name: string; p_category_name: string };
        expect(request.p_gift_ids).toEqual([newGiftId, oldGiftId]);
        expect(request.p_name).toBe("A garden table");
        expect(request.p_category_name).toBe("Travel plans");
        databaseGifts.unshift({
          id: newGiftId,
          category_id: "category-travel",
          name: request.p_name,
          description: "For long dinners",
          target_amount: "24000.00",
          external_url: null,
          sort_order: 0,
        });
        publicGifts.unshift({
          id: newGiftId,
          name: request.p_name,
          description: "For long dinners",
          target_amount: 24000,
          external_url: null,
          category: request.p_category_name,
          committed_amount: 0,
          verified_amount: 0,
          is_reserved: false,
        });
        return new Response(JSON.stringify(newGiftId), { status: 200 });
      }
      if (url.pathname === "/rest/v1/rpc/reorder_registry_gifts") {
        const request = JSON.parse(String(init?.body)) as { p_gift_ids: string[] };
        expect(request.p_gift_ids).toEqual([oldGiftId, newGiftId]);
        databaseGifts.reverse().forEach((gift, index) => { gift.sort_order = index; });
        publicGifts.reverse();
        return new Response(null, { status: 204 });
      }
      if (url.pathname === "/rest/v1/rpc/get_public_registry") {
        return new Response(JSON.stringify({
          ...registryRow,
          gifts: publicGifts,
          payment_instructions: {
            payment_recipients: paymentRecipients,
            bank_account_name: paymentSettings.bank_account_name,
            bank_account_number: paymentSettings.bank_account_number,
            bank_ifsc: paymentSettings.bank_ifsc,
            cash_instructions: paymentSettings.cash_instructions,
            general_instructions: paymentSettings.general_instructions,
          },
        }), { status: 200 });
      }
      throw new Error(`Unexpected Supabase request: ${url.pathname}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("crypto", {
      randomUUID: () => newGiftId,
      getRandomValues: (value: Uint8Array) => value,
      subtle: {
        importKey: vi.fn().mockResolvedValue({}),
        deriveBits: vi.fn().mockResolvedValue(new ArrayBuffer(32)),
      },
    });
    window.localStorage.setItem("shaadiledger.supabase.session.v1", JSON.stringify({
      accessToken: "test-access-token",
      refreshToken: "test-refresh-token",
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      user: { id: "owner-id", email: "maya@example.com" },
    }));
    window.history.replaceState(null, "", `${window.location.origin}${window.location.pathname}#dashboard`);
    const { default: SupabaseApp } = await import("./App");
    render(<SupabaseApp />);

    expect(await screen.findByRole("heading", { name: /Maya.*Neel/i })).toBeTruthy();
    expect(await screen.findByText("A reading chair")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Add a gift/i }));
    fireEvent.change(screen.getByLabelText("Gift name"), { target: { value: "A garden table" } });
    fireEvent.change(screen.getByLabelText("What makes it special? (optional)"), { target: { value: "For long dinners" } });
    fireEvent.change(screen.getByLabelText("Gift value"), { target: { value: "24000" } });
    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "Travel plans" } });
    fireEvent.change(screen.getByLabelText("Wishlist priority"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: /Add gift to wishlist/i }));

    expect(await screen.findByText("A garden table")).toBeTruthy();
    expect(screen.getByText("Priority 1 · Travel plans")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Move A garden table down" }));
    await waitFor(() => expect(screen.getByText("Priority 1 · For our home")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:54321/rest/v1/rpc/reorder_registry_gifts",
      expect.objectContaining({ method: "POST" }),
    );

    window.location.hash = "public-registry?slug=maya-neel";
    expect(await screen.findByRole("heading", { name: /Our little wishlist/i })).toBeTruthy();
    const chairHeading = screen.getByRole("heading", { name: "A reading chair" });
    const tableHeading = screen.getByRole("heading", { name: "A garden table" });
    expect(chairHeading.compareDocumentPosition(tableHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("creates and cancels a Supabase reservation using its private status link", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "local-anon-key");
    const guestToken = "a".repeat(64);
    let status = "reserved";
    const registry = {
      id: "registry-id",
      couple_names: "Maya & Neel",
      wedding_date: "2027-09-12",
      city: "Pune",
      welcome_message: "Celebrate with us.",
      public_slug: "maya-neel",
      gifts: [{
        id: "gift-id",
        name: "A reading chair",
        description: "For slow mornings",
        target_amount: 12500,
        external_url: null,
        category: "For our home",
        committed_amount: 0,
        verified_amount: 0,
        is_reserved: false,
      }],
      payment_instructions: null,
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === "/rest/v1/rpc/get_public_registry") {
        return new Response(JSON.stringify(registry), { status: 200 });
      }
      if (url.pathname === "/functions/v1/create-reservation") {
        expect(JSON.parse(String(init?.body))).toEqual({
          giftId: "gift-id",
          guestName: "Rohan",
          email: "rohan@example.com",
        });
        return new Response(JSON.stringify({ reservation_id: "reservation-id", status: "reserved", guest_token: guestToken }), { status: 200 });
      }
      if (url.pathname === "/functions/v1/guest-activity") {
        return new Response(JSON.stringify({
          kind: "reservation",
          status,
          gift_name: "A reading chair",
          couple_names: "Maya & Neel",
          created_at: "2026-11-16T00:00:00Z",
        }), { status: 200 });
      }
      if (url.pathname === "/functions/v1/cancel-reservation") {
        expect(JSON.parse(String(init?.body))).toEqual({ token: guestToken });
        status = "cancelled";
        return new Response(JSON.stringify({ status }), { status: 200 });
      }
      throw new Error(`Unexpected Supabase request: ${url.pathname}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    window.history.replaceState(null, "", `${window.location.origin}${window.location.pathname}#public-registry?slug=maya-neel`);
    const { default: ConnectedApp } = await import("./App");
    render(<ConnectedApp />);

    fireEvent.click(await screen.findByRole("button", { name: "Reserve this gift" }));
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Rohan" } });
    fireEvent.change(screen.getByLabelText("Email or phone number"), { target: { value: "rohan@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Reserve this gift" }));

    expect(await screen.findByText("Reserved")).toBeTruthy();
    expect(window.location.hash).toContain(`#guest-status?token=${guestToken}`);
    expect(window.location.search).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Cancel this reservation" }));
    expect(await screen.findByText("Reservation cancelled")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:54321/functions/v1/cancel-reservation",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("creates a Supabase group pledge, shows offline payment details, and reports payment", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "local-anon-key");
    const guestToken = "b".repeat(64);
    let status = "pledged";
    const registry = {
      id: "registry-id",
      couple_names: "Maya & Neel",
      wedding_date: "2027-09-12",
      city: "Pune",
      welcome_message: "Celebrate with us.",
      public_slug: "maya-neel",
      gifts: [{
        id: "gift-id",
        name: "A reading chair",
        description: "For slow mornings",
        target_amount: 12500,
        external_url: null,
        category: "For our home",
        committed_amount: 0,
        verified_amount: 0,
        is_reserved: false,
      }],
      payment_instructions: {
        payment_recipients: [{
          id: "recipient-id",
          display_name: "Maya",
          upi_id: "maya@exampleupi",
          qr_image_path: null,
          qr_image_url: null,
        }],
        bank_account_name: null,
        bank_account_number: null,
        bank_ifsc: null,
        cash_instructions: null,
        general_instructions: "Please mention the wedding gift.",
      },
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === "/rest/v1/rpc/get_public_registry") {
        return new Response(JSON.stringify(registry), { status: 200 });
      }
      if (url.pathname === "/functions/v1/create-group-pledge") {
        expect(JSON.parse(String(init?.body))).toEqual({
          giftId: "gift-id",
          amount: 2000,
          guestName: "Meera",
          phone: "+91 98765 43210",
        });
        return new Response(JSON.stringify({ contribution_id: "contribution-id", status: "pledged", guest_token: guestToken }), { status: 200 });
      }
      if (url.pathname === "/functions/v1/guest-activity") {
        return new Response(JSON.stringify({
          kind: "contribution",
          status,
          amount: 2000,
          expires_at: status === "pledged" ? "2026-11-19T00:00:00Z" : null,
          gift_name: "A reading chair",
          couple_names: "Maya & Neel",
          created_at: "2026-11-16T00:00:00Z",
        }), { status: 200 });
      }
      if (url.pathname === "/functions/v1/report-payment") {
        expect(JSON.parse(String(init?.body))).toEqual({ token: guestToken });
        status = "payment_reported";
        return new Response(JSON.stringify({ status }), { status: 200 });
      }
      throw new Error(`Unexpected Supabase request: ${url.pathname}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    window.history.replaceState(null, "", `${window.location.origin}${window.location.pathname}#public-registry?slug=maya-neel`);
    const { default: ConnectedApp } = await import("./App");
    render(<ConnectedApp />);

    fireEvent.click(await screen.findByRole("button", { name: "Contribute any amount" }));
    expect(screen.getByText("maya@exampleupi")).toBeTruthy();
    expect(screen.getByText("Please mention the wedding gift.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Your contribution amount"), { target: { value: "2000" } });
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Meera" } });
    fireEvent.change(screen.getByLabelText("Email or phone number"), { target: { value: "+91 98765 43210" } });
    fireEvent.click(screen.getByRole("button", { name: /Continue with contribution/i }));

    expect(await screen.findByText("Contribution pledged")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "I've paid — report payment" }));
    expect(await screen.findByText("Payment reported")).toBeTruthy();
    expect(screen.getByText(/The couple will update this status/i)).toBeTruthy();
  });

  it("loads private couple activity and releases reservations, verifies and rejects reports", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "local-anon-key");
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const registryRow = {
      id: "registry-id",
      owner_id: "owner-id",
      couple_names: "Maya & Neel",
      wedding_date: "2027-09-12",
      city: "Pune",
      welcome_message: "Celebrate with us.",
      public_slug: "maya-neel",
      is_published: true,
    };
    const activeReservations = [{
      id: "reservation-id",
      gift_id: "gift-id",
      guest_id: "guest-reservation",
      status: "reserved",
      created_at: "2026-11-15T10:00:00Z",
    }];
    const contributions = [
      {
        id: "verified-report-id",
        gift_id: "gift-id",
        guest_id: "guest-verify",
        amount: 2000,
        status: "payment_reported",
        created_at: "2026-11-15T11:00:00Z",
        payment_reported_at: "2026-11-15T12:00:00Z",
        expires_at: null,
      },
      {
        id: "rejected-report-id",
        gift_id: "gift-id",
        guest_id: "guest-reject",
        amount: 1500,
        status: "payment_reported",
        created_at: "2026-11-15T13:00:00Z",
        payment_reported_at: "2026-11-15T14:00:00Z",
        expires_at: null,
      },
      {
        id: "pledge-id",
        gift_id: "gift-id",
        guest_id: "guest-pledge",
        amount: 1000,
        status: "pledged",
        created_at: "2026-11-15T15:00:00Z",
        payment_reported_at: null,
        expires_at: "2026-11-18T15:00:00Z",
      },
    ];
    const guests = [
      { id: "guest-reservation", name: "Rohan", email: "rohan@example.com", phone: null },
      { id: "guest-verify", name: "Meera", email: null, phone: "+919876543210" },
      { id: "guest-reject", name: "Kabir", email: "kabir@example.com", phone: null },
      { id: "guest-pledge", name: "Ananya", email: "ananya@example.com", phone: null },
    ];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === "/rest/v1/registries") return new Response(JSON.stringify([registryRow]), { status: 200 });
      if (url.pathname === "/rest/v1/gift_categories") return new Response(JSON.stringify([]), { status: 200 });
      if (url.pathname === "/rest/v1/gifts") return new Response(JSON.stringify([{
        id: "gift-id",
        category_id: null,
        name: "A reading chair",
        description: "For slow mornings",
        target_amount: "12500.00",
        external_url: null,
        sort_order: 0,
      }]), { status: 200 });
      if (url.pathname === "/rest/v1/reservations") return new Response(JSON.stringify(activeReservations), { status: 200 });
      if (url.pathname === "/rest/v1/contributions") return new Response(JSON.stringify(contributions.filter((row) =>
        row.status === "pledged" || row.status === "payment_reported"
      )), { status: 200 });
      if (url.pathname === "/rest/v1/guests") return new Response(JSON.stringify(guests), { status: 200 });
      if (url.pathname.startsWith("/rest/v1/rpc/")) {
        const request = JSON.parse(String(init?.body)) as {
          p_reservation_id?: string;
          p_contribution_id?: string;
          p_decision?: string;
        };
        if (url.pathname.endsWith("/release_reservation")) {
          expect(request).toEqual({ p_reservation_id: "reservation-id" });
          activeReservations.splice(0, 1);
        } else if (url.pathname.endsWith("/review_contribution")) {
          if (request.p_decision === "verified") {
            expect(request.p_contribution_id).toBe("verified-report-id");
            contributions.find((row) => row.id === request.p_contribution_id)!.status = "verified";
          } else {
            expect(request).toMatchObject({
              p_contribution_id: "rejected-report-id",
              p_decision: "rejected",
              p_rejection_reason: "Please double-check the transfer.",
            });
            contributions.find((row) => row.id === request.p_contribution_id)!.status = "rejected";
          }
        } else if (url.pathname.endsWith("/release_unpaid_pledge")) {
          expect(request).toEqual({ p_contribution_id: "pledge-id" });
          contributions.find((row) => row.id === request.p_contribution_id)!.status = "released";
        } else {
          throw new Error(`Unexpected member RPC: ${url.pathname}`);
        }
        return new Response("true", { status: 200, headers: { "Content-Type": "application/json" } });
      }
      throw new Error(`Unexpected Supabase request: ${url.pathname}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    window.localStorage.setItem("shaadiledger.supabase.session.v1", JSON.stringify({
      accessToken: "test-access-token",
      refreshToken: "test-refresh-token",
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      user: { id: "owner-id", email: "maya@example.com" },
    }));
    window.history.replaceState(null, "", `${window.location.origin}${window.location.pathname}#management`);
    const { default: ConnectedApp } = await import("./App");
    render(<ConnectedApp />);

    expect(await screen.findByText(/Reserved by Rohan/)).toBeTruthy();
    expect(screen.getByText(/rohan@example\.com/)).toBeTruthy();
    expect(screen.getByText("Meera · ₹2,000")).toBeTruthy();
    expect(screen.getByText("Kabir · ₹1,500")).toBeTruthy();
    expect(screen.getByText("Ananya · ₹1,000")).toBeTruthy();
    const reportToVerify = screen.getByText("Meera · ₹2,000").closest(".management-row");
    if (!(reportToVerify instanceof HTMLElement)) throw new Error("The verified contribution row was not rendered.");
    fireEvent.click(within(reportToVerify).getByRole("button", { name: "Verify" }));
    await waitFor(() => expect(screen.queryByText("Meera · ₹2,000")).toBeNull());

    const reportToReject = screen.getByText("Kabir · ₹1,500").closest(".management-row");
    if (!(reportToReject instanceof HTMLElement)) throw new Error("The rejected contribution row was not rendered.");
    fireEvent.change(within(reportToReject).getByLabelText("Rejection note (optional)"), {
      target: { value: "Please double-check the transfer." },
    });
    fireEvent.click(within(reportToReject).getByRole("button", { name: "Reject" }));
    await waitFor(() => expect(screen.queryByText("Kabir · ₹1,500")).toBeNull());

    const reservationRow = screen.getByText(/Reserved by Rohan/).closest(".management-row");
    if (!(reservationRow instanceof HTMLElement)) throw new Error("The reservation row was not rendered.");
    fireEvent.click(within(reservationRow).getByRole("button", { name: "Release" }));
    await waitFor(() => expect(screen.queryByText(/Reserved by Rohan/)).toBeNull());

    const pledgeRow = screen.getByText("Ananya · ₹1,000").closest(".management-row");
    if (!(pledgeRow instanceof HTMLElement)) throw new Error("The unpaid pledge row was not rendered.");
    fireEvent.click(within(pledgeRow).getByRole("button", { name: "Release pledge" }));
    await waitFor(() => expect(screen.queryByText("Ananya · ₹1,000")).toBeNull());
  });

  it("saves couple payment instructions and makes them available on the public contribution page", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "local-anon-key");
    const registryRow = {
      id: "registry-id",
      owner_id: "owner-id",
      couple_names: "Maya & Neel",
      wedding_date: "2027-09-12",
      city: "Pune",
      welcome_message: "Celebrate with us.",
      public_slug: "maya-neel",
      is_published: true,
    };
    const giftRow = {
      id: "gift-id",
      category_id: null,
      name: "A reading chair",
      description: "For slow mornings",
      target_amount: "12500.00",
      external_url: null,
      sort_order: 0,
    };
    let settingsRow: Record<string, string | null> | null = null;
    const recipientRows: Array<{
      id: string;
      display_name: string;
      upi_id: string;
      qr_image_path: string | null;
      sort_order: number;
    }> = [{
      id: "legacy-recipient",
      display_name: "Couple",
      upi_id: "legacy@exampleupi",
      qr_image_path: null,
      sort_order: 0,
    }];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === "/rest/v1/registries") return new Response(JSON.stringify([registryRow]), { status: 200 });
      if (url.pathname === "/rest/v1/gift_categories") return new Response(JSON.stringify([]), { status: 200 });
      if (url.pathname === "/rest/v1/gifts") return new Response(JSON.stringify([giftRow]), { status: 200 });
      if (url.pathname === "/rest/v1/payment_settings") {
        return new Response(JSON.stringify(settingsRow ? [settingsRow] : []), { status: 200 });
      }
      if (url.pathname === "/rest/v1/registry_payment_recipients") {
        return new Response(JSON.stringify(recipientRows), { status: 200 });
      }
      if (url.pathname.startsWith("/storage/v1/object/sign/payment-qrs/")) {
        return new Response(JSON.stringify({
          signedURL: `${url.pathname.replace("/storage/v1", "")}?token=test-qr-token`,
        }), { status: 200 });
      }
      if (url.pathname.startsWith("/storage/v1/object/payment-qrs/")) {
        return new Response(JSON.stringify({ Key: url.pathname }), { status: 200 });
      }
      if (url.pathname === "/rest/v1/rpc/save_registry_payment_settings") {
        const request = JSON.parse(String(init?.body)) as {
          p_settings: Record<string, string | null>;
          p_recipients: Array<{ id: string; display_name: string; upi_id: string; qr_image_path: string | null }>;
        };
        settingsRow = request.p_settings;
        recipientRows.splice(0, recipientRows.length, ...request.p_recipients.map((recipient, sort_order) => ({
          ...recipient,
          sort_order,
        })));
        return new Response(null, { status: 204 });
      }
      if (url.pathname === "/rest/v1/rpc/get_public_registry") {
        return new Response(JSON.stringify({
          ...registryRow,
          gifts: [{
            id: "gift-id",
            name: "A reading chair",
            description: "Public share details",
            target_amount: 12500,
            external_url: null,
            category: "For our home",
            committed_amount: 0,
            verified_amount: 0,
            is_reserved: false,
          }],
          payment_instructions: settingsRow ? {
            ...settingsRow,
            payment_recipients: recipientRows,
          } : null,
        }), { status: 200 });
      }
      throw new Error(`Unexpected Supabase request: ${url.pathname}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    window.localStorage.setItem("shaadiledger.supabase.session.v1", JSON.stringify({
      accessToken: "test-access-token",
      refreshToken: "test-refresh-token",
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      user: { id: "owner-id", email: "maya@example.com" },
    }));
    window.history.replaceState(null, "", `${window.location.origin}${window.location.pathname}#dashboard`);
    const { default: ConnectedApp } = await import("./App");
    render(<ConnectedApp />);

    expect(await screen.findByRole("heading", { name: "Payment instructions" })).toBeTruthy();
    await waitFor(() => expect(
      screen.getByRole("button", { name: "Save payment instructions" }).hasAttribute("disabled"),
    ).toBe(false));
    expect(await screen.findByDisplayValue("legacy@exampleupi")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add a person" }));
    fireEvent.change(screen.getAllByLabelText("Name shown to guests")[1], { target: { value: "Maya Sharma" } });
    fireEvent.change(screen.getAllByLabelText("UPI ID")[1], { target: { value: "maya@exampleupi" } });
    fireEvent.change(screen.getAllByLabelText(/UPI QR code/i)[1], {
      target: { files: [new File(["local qr image"], "maya-qr.png", { type: "image/png" })] },
    });
    expect(await screen.findByText("Selected: maya-qr.png")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel selected QR" }));
    expect(screen.queryByText("Selected: maya-qr.png")).toBeNull();
    fireEvent.change(screen.getAllByLabelText(/UPI QR code/i)[1], {
      target: { files: [new File(["local qr image"], "maya-qr.png", { type: "image/png" })] },
    });
    fireEvent.change(screen.getByLabelText(/Bank account name/i), { target: { value: "Maya Sharma" } });
    fireEvent.change(screen.getByLabelText(/Bank account number/i), { target: { value: "1234567890" } });
    fireEvent.change(screen.getByLabelText(/IFSC code/i), { target: { value: "abcd0123456" } });
    fireEvent.change(screen.getByLabelText(/Additional instructions/i), { target: { value: "Mention our wedding gift." } });
    fireEvent.click(screen.getByRole("button", { name: "Save payment instructions" }));

    expect(await screen.findByText(/Payment instructions saved/i)).toBeTruthy();
    expect(recipientRows.map(({ display_name, upi_id }) => [display_name, upi_id])).toEqual([
      ["Couple", "legacy@exampleupi"],
      ["Maya Sharma", "maya@exampleupi"],
    ]);
    expect(recipientRows[1].qr_image_path).toMatch(/^registry-id\/.+\.png$/);
    expect(settingsRow).toEqual({
      bank_account_name: "Maya Sharma",
      bank_account_number: "1234567890",
      bank_ifsc: "ABCD0123456",
      cash_instructions: null,
      general_instructions: "Mention our wedding gift.",
    });

    window.location.hash = "public-registry?slug=maya-neel";
    expect(await screen.findByRole("heading", { name: /Our little wishlist/i })).toBeTruthy();
    await waitFor(() => expect(fetchMock.mock.calls.some(([input]) =>
      new URL(String(input)).pathname === "/rest/v1/rpc/get_public_registry"
    )).toBe(true));
    expect(await screen.findByText("Public share details")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Contribute any amount/i }));
    expect(await screen.findByText("legacy@exampleupi")).toBeTruthy();
    expect(await screen.findByText("maya@exampleupi")).toBeTruthy();
    expect(screen.getAllByText("Maya Sharma")).toHaveLength(2);
    expect(screen.getByText("Mention our wedding gift.")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Maya Sharma UPI QR code" }).getAttribute("src")).toContain("test-qr-token");
  });
});
