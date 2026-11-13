import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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
});
