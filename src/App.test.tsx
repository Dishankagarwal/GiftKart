import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

const screens = [
  ["landing", "Landing page", /Gifts that feel/i],
  ["login", "Couple sign in", /Your registry awaits/i],
  ["create-account", "Couple registration", /Create your account/i],
  ["create-registry", "Create registry", /Let's make it yours/i],
  ["dashboard", "Couple dashboard", /Aarav.*Priya/i],
  ["edit-gift", "Add / edit gift", /Add a little wish/i],
  ["public-registry", "Public wishlist", /Aarav.*Priya/i],
  ["reserve-gift", "Reserve a gift", /A thoughtful choice/i],
  ["contribute", "Group contribution", /A little, together/i],
  ["guest-status", "Guest status", /Your gift, with love/i],
  ["management", "Gift management", /A little love, coming in/i],
] as const;

beforeEach(() => {
  window.history.replaceState(null, "", window.location.pathname);
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
});

describe("ShaadiLedger screen prototype", () => {
  it("shows the landing page by default", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: /Gifts that feel/i })).toBeTruthy();
    expect(screen.getByText(/Demo only — changes are not saved/)).toBeTruthy();
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

  it("supports the couple account creation path into registry setup", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /Create your registry/i }));
    expect(screen.getByRole("heading", { name: /Create your account/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Continue to registry details/i }));

    expect(window.location.hash).toBe("#create-registry");
    expect(screen.getByRole("heading", { name: /Let's make it yours/i })).toBeTruthy();
  });

  it("keeps the shared header visible while navigating between screens", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /Start your registry/i }));

    expect(screen.getByRole("banner")).toBeTruthy();
    expect(within(screen.getByRole("navigation", { name: "Main navigation" })).getByRole("button", { name: /Couple sign in/i })).toBeTruthy();
  });

  it("takes an individual gift guest through reservation confirmation", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("link", { name: "Find a registry" }));
    fireEvent.click(screen.getAllByRole("button", { name: /Choose this gift/i })[0]);
    expect(screen.getByRole("heading", { name: /A thoughtful choice/i })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Preview reservation confirmation/i }));
    expect(screen.getByRole("heading", { name: /Your gift, with love/i })).toBeTruthy();
    expect(screen.getByText("Reserved")).toBeTruthy();
  });

  it("takes a group gift guest through payment reporting status", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("link", { name: "Find a registry" }));
    fireEvent.click(screen.getByRole("button", { name: /Contribute to this gift/i }));
    expect(screen.getByRole("heading", { name: /A little, together/i })).toBeTruthy();
    expect(screen.getByText(/does not collect or process payment/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Preview pledge and payment steps/i }));
    expect(screen.getByRole("heading", { name: /Your gift, with love/i })).toBeTruthy();
    expect(screen.getByText(/Payment reported/i)).toBeTruthy();
  });

  it("shows gift management from the couple dashboard", () => {
    render(<App />);

    fireEvent.click(within(screen.getByRole("navigation", { name: "Main navigation" })).getByRole("button", { name: /Couple sign in/i }));
    fireEvent.click(screen.getByRole("button", { name: "Create an account" }));
    fireEvent.click(screen.getByRole("button", { name: /Continue to registry details/i }));
    fireEvent.click(screen.getByRole("button", { name: /Preview your dashboard/i }));
    fireEvent.click(screen.getByText("Explore prototype screens"));
    fireEvent.click(screen.getByRole("button", { name: "Gift management" }));

    expect(screen.getByRole("heading", { name: /A little love, coming in/i })).toBeTruthy();
    expect(screen.getByText(/Payment proof is not collected/i)).toBeTruthy();
  });
});
