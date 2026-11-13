# ShaadiLedger

ShaadiLedger is a personalized wedding gift registry. Couples publish a wishlist of gifts with values; guests decide whether to reserve a gift in full or contribute any amount toward it, then pay the couple directly offline.

> Product principle: Make gifting effortless for guests and gift management effortless for couples.
>
> Developers and AI assistants continuing the project should start with [PROJECT_GUIDE.md](./PROJECT_GUIDE.md) for architecture, current implementation status, setup, and the recommended roadmap.

## Phase 1 scope

### Included

- Couple account and one registry for the couple.
- Registry owner can invite one partner as a collaborator. Both verified members can manage the registry.
- Wedding names/date, welcome message, unique public link, publish/unpublish, and share.
- Gifts with categories, values, optional product links, and priority order; a store favicon is derived from the product link for the gift thumbnail.
- On the public wishlist, guests choose whether to reserve the full gift or contribute an amount. The first active choice determines availability: a reservation blocks contributions, while contributions block a full reservation and allow more contributions up to the gift value.
- A guest can cancel their own reservation; a couple member can release it.
- Guests pay the couple directly using offline UPI, bank transfer, or cash instructions. No payment gateway or proof upload.
- Guests report that a payment was made. A registry member verifies or rejects the report.
- Guests can securely check their contribution status without creating an account.
- Essential confirmations and updates through in-app dashboard notices and email. WhatsApp sharing is supported; WhatsApp notifications are not in Phase 1.

### Excluded

- Payment gateway or in-app collection of funds.
- Surprise mode.
- Event-wise registries or separate bride/groom registries.
- Payment-proof uploads.
- Guest accounts.

## Roles and journeys

### Couple and partner collaborator

1. Owner registers and creates the registry.
2. Owner may invite a partner; the partner verifies their account before receiving registry-management access.
3. Members create and publish the registry, manage gifts, and share the public link.
4. Members review reservations, release reservations when appropriate, and verify or reject reported contributions.
5. Members can update offline payment instructions and review the activity log.

### Guest

1. Opens a published registry without signing in.
2. Chooses to reserve a gift in full or contribute an amount toward it.
3. Pays the couple offline using the displayed instructions.
4. Reports the payment and receives a secure link to check the contribution status.

## Product and business rules

### Full-gift reservations

- A gift can have at most one active reservation. PostgreSQL must enforce this atomically; frontend availability checks are not sufficient.
- A reserved gift cannot accept contributions. Once a contribution is active, payment-reported, or verified, the gift cannot be reserved in full; additional contributions may use its remaining capacity.
- Guests can cancel only their own reservation. Registry members can release a reservation.
- A cancelled or released reservation makes the gift available again.
- Reservation identity and contact information are visible only to authorized registry members and the guest through a secure confirmation link.

### Contributions

- **Overfunding is disabled.** Available capacity is the gift value minus verified contributions, active pledges, and payment-reported contributions.
- Creating a pledge reserves capacity. The amount must be positive, valid, and within remaining capacity; allocation must be atomic under concurrent requests.
- An unpaid pledge expires after 72 hours and releases its reserved capacity. A registry member may release a pledge earlier. Guests cannot cancel pledges.
- Once payment is reported, the contribution does not expire automatically and continues to count against capacity until verified or rejected.
- Only verified contributions count as collected. Pledged and payment-reported amounts reserve capacity but do not count as collected progress.
- A rejected contribution does not count toward collected progress or capacity. The guest can report the payment again after checking the payment instructions; previous status changes remain in the audit history.
- Guests cannot verify, reject, or cancel contributions. Only verified registry members can verify or reject.
- If an offline refund is required, the couple handles it outside the application.

### Guest access and privacy

- Guests do not need accounts. Collect only their name and one contact method (email or phone).
- Guest confirmation links use cryptographically random tokens; store only token hashes. Tokens expire after 90 days by default and can be revoked.
- A valid token reveals only the associated reservation/contribution status and the information needed for that guest's flow.
- Public endpoints expose only published registry and gift information. Guest contact details, reservation identities, payment reports, and member data are private.
- No payment proof is collected or stored in Phase 1.

### Statuses versus screen states

Business statuses (such as `reserved`, `pledged`, `payment_reported`, `verified`, `rejected`, `expired`, and `released`) describe persisted product data. Interface states (such as loading, empty, error, unavailable, and success) describe what a screen displays. Keep these separate in code and tests.

## Screen inventory

| # | Screen | User | Main purpose |
|---|---|---|---|
| 1 | Landing page | Everyone | Explain the service and direct couples to registration or guests to a registry link. |
| 2 | Couple registration / login | Couple | Create an account or sign in. |
| 3 | Create wedding registry | Couple | Enter names, wedding date, welcome message, and initial settings. |
| 4 | Couple dashboard | Couple | See registry status, gifts, reservations, contributions, and notifications. |
| 5 | Add / edit gift | Couple | Manage gifts, images, categories, links, and values. |
| 6 | Public wedding wishlist | Guest | Browse gifts, choose full reservation or contribution, and see availability/progress. |
| 7 | Gift details and reservation | Guest | Reserve a gift in full with name and one contact method. |
| 8 | Contribution and payment instructions | Guest | Contribute an amount, view offline instructions, and report payment. |
| 9 | Contribution confirmation and status | Guest | Confirm submission and securely check reservation/contribution status. |
| 10 | Reservation and contribution management | Couple | Release reservations and review, verify, or reject reports. |

The inventory has 10 product areas. Account access is one area with two modes (sign in and create account), not two unrelated experiences. The shared header and footer are persistent site chrome, not separate product screens.

## UX specification — review draft

This specification describes the intended Phase 1 behavior for the 10 product areas. It is the basis for wireframe review; it does not mean every screen or backend workflow is fully implemented. Without Supabase environment settings, the app uses browser-local demo data. When configured, couple authentication, registry details, publication, and public registry details use Supabase; wishlist and guest workflows remain demo-only until their integration steps are complete.

### Global navigation and layout

- Keep the ShaadiLedger brand/header visible across landing, account, couple, and guest pages. The brand returns to the landing page.
- In the signed-out header, show **Find a registry** and **Couple sign in**. “Create your registry” and “Start your registry” both open account creation; a successful account step continues to registry setup. Sign-in remains a separate mode with a link to create an account.
- When signed in, replace guest/account actions with couple navigation: **Dashboard**, **Registry preview**, and an account menu with partner invitation, settings, and sign out. Mark the current section visually and with `aria-current`.
- Do not imply that a public registry slug is a secret. Guests open their shared registry URL directly; the search/link entry must not expose guest details.
- On small screens, retain the brand and a clearly labeled menu button. The menu opens/closes by keyboard and touch, traps no focus unnecessarily, closes after navigation, and exposes the same destinations as desktop.
- Use a consistent footer for informational navigation and a compact prototype-only screen switcher in development. Remove the prototype switcher from production.
- Page navigation updates the URL and browser history. Back/forward must restore the correct screen. On route changes, move focus to the page heading and reset scroll to the top without disrupting reduced-motion settings.
- Show one page-level heading, preserve visible focus, support keyboard-only operation, use labeled fields and useful inline errors, and maintain readable contrast and touch targets.
- On narrow screens, use one-column layouts, full-width primary actions, and no horizontal scrolling. Desktop may use two-column forms and dashboard panels.

### Screen-by-screen behavior

#### 1. Landing page

- **Goal:** Explain the product and route couples to account creation and guests to their registry.
- **Content:** Short product value statement; three-step explanation (make the registry, share it, receive gifts offline); primary **Create your registry** action; secondary **Explore a sample** action; clear note that guests do not need an account and payment is made directly to the couple.
- **Actions/navigation:** Primary action → account creation. Sign-in → sign-in mode. A guest with a link opens that registry URL; the sample action is prototype-only.
- **States:** Initial page loads without private data. If sample content fails, show a retry or the explanatory landing content; do not make a failed lookup look like a real registry.
- **Mobile:** Stack hero and preview card; keep primary action visible without requiring sideways scrolling.

#### 2. Couple registration / login

- **Goal:** Let a couple account owner create an account or let an existing member sign in.
- **Content:** Clearly distinguish **Create account** and **Sign in**; email and password fields; password visibility control; password guidance; links between the two modes; submit/loading feedback.
- **Actions/navigation:** Successful registration → create registry for a new owner, or dashboard if an invited collaborator already has a membership. Successful sign-in → dashboard. Authentication errors stay on the form with actionable, non-sensitive copy.
- **States:** Validate required fields and email format; show submitting state; prevent duplicate submits; show generic invalid-credentials messaging; provide account verification/resend flow if email confirmation is enabled. Never claim authentication succeeded in demo mode.
- **Mobile:** Single-column form, appropriate email/password keyboards and autocomplete.

#### 3. Create wedding registry

- **Goal:** Create the first registry after account creation.
- **Content:** Couple names, wedding date, city (if retained), welcome message, and a short explanation of what will be public. Make required and optional fields explicit.
- **Actions/navigation:** **Create registry** validates and saves; success → dashboard with draft/unpublished status. Back returns to account flow without silently losing entered values.
- **States:** Inline field validation; saving state; slug collision handled by suggesting another slug; recoverable error preserves entered content. Never publish automatically without a clear, explicit publish action.
- **Mobile:** Stack fields; date control is touch-friendly; textarea and save action span the available width.

#### 4. Couple dashboard

- **Goal:** Give owner and verified partner collaborator a concise overview and next actions.
- **Content:** Registry draft/published state; preview/share link; gift count and availability; verified contribution totals; pending payment reports; recent reservations/activity; partner membership status.
- **Actions/navigation:** Add/edit gifts → gift form; review reservations/reports → management; preview/share → public view; publish/unpublish and invite collaborator require explicit confirmation where impact is significant.
- **States:** First-use empty state prompts registry/gift setup. Loading uses a stable skeleton. Errors identify the section and provide retry. Published link is copyable and gives a success confirmation. Show zero verified amount distinctly from “not loaded.”
- **Mobile:** Stack summary cards; keep the most urgent pending verification visible before long gift lists.

#### 5. Add / edit gift

- **Goal:** Let a verified member create or update a gift.
- **Content:** Gift name, description, category, value, wishlist priority, and optional product link. The couple does not choose the guest's giving method.
- **Actions/navigation:** Save → dashboard/list; cancel/back returns without saving. Delete/archive requires confirmation and explains impact if there are active reservations or contributions.
- **States:** Validate name, positive INR value, HTTP(S) product URLs, and valid priority. If a store favicon is unavailable, show a gift-name monogram; gift actions remain disabled while saving.
- **Mobile:** Single column; product URL field is easy to paste into; sticky or clearly visible save action.

#### 6. Public wedding wishlist

- **Goal:** Let guests understand the couple’s wishes and select a gift without signing in.
- **Content:** Published couple names/date/welcome note, gift cards grouped by category, full-reservation availability, contribution capacity and verified progress, and a discreet offline-payment explanation.
- **Actions/navigation:** Gift → guest's choice of full reservation or contribution. Copy/share registry link may be offered. Never display reservation guest names, contact information, pending payment reports, or member details.
- **States:** Loading skeleton; published registry with no gifts has a friendly empty state; unknown/unpublished slug has a not-found/private message; fetch error offers retry. A reserved gift cannot be contributed toward. Once contributions start, guests may continue contributing within capacity but cannot reserve the full gift. A fully funded gift is shown as complete.
- **Mobile:** Single-column cards and category controls; avoid dense filters; show target/progress without relying on color alone.

#### 7. Full gift reservation

- **Goal:** Let a guest reserve one available gift in full and give the couple enough information to recognize them.
- **Content:** Gift details/price, optional product link, availability, guest name, one contact method (email or phone), and privacy statement.
- **Actions/navigation:** Submit reservation → confirmation with secure guest link. Guest may later cancel their own active reservation through that link. The couple may release it from management.
- **States:** Validate name/contact; submitting state; atomic conflict returns an **already reserved** message and a link back to wishlist; successful reservation confirms the gift and supplies the private status link. Expired/revoked link reveals no private data.
- **Mobile:** Keep gift summary visible above a short form; use correct autocomplete/input mode; clearly state that the couple sees name and contact details.

#### 8. Contribution and offline payment instructions

- **Goal:** Reserve an amount against a gift, then let the guest pay the couple directly and report it.
- **Content:** Gift description, optional product link, target, verified progress, remaining available capacity, amount field, guest name/contact, and the couple’s configured UPI/bank/cash instructions. State plainly that ShaadiLedger does not collect/process payment and does not request proof.
- **Actions/navigation:** Submit pledge → show pledge amount and 72-hour expiry. **I’ve paid** records a payment report; it does not verify payment. The report leads to a status link. No guest cancellation action is provided.
- **States:** Amount must be positive and no greater than current remaining capacity. If another pledge consumes capacity concurrently, return updated remaining amount and ask the guest to retry with a valid amount. Full target disables new pledges. Expired unpaid pledge releases capacity. Reported payment awaits couple review and does not expire automatically.
- **Mobile:** Payment instructions are readable and easy to copy; amount and primary action stay prominent. Never imply that copying or viewing details is a payment.

#### 9. Confirmation and guest status

- **Goal:** Confirm a reservation or contribution and later reveal only its status to the guest.
- **Content:** Gift name, reservation/contribution amount as appropriate, current business status, next step, couple-facing privacy notice, and a link back to the public registry.
- **Actions/navigation:** Group pledge page offers the next step to mark offline payment as reported. The secure guest link opens only the linked reservation/contribution; rejected payment allows the guest to review instructions and report again. There is no guest cancellation for group contributions.
- **States:** Distinguish `pledged` (pay within 72 hours), `payment_reported` (awaiting review), `verified`, `rejected` (may report again), `expired`, `reserved`, `cancelled`, and `released`. Expired/revoked/invalid token shows a generic unavailable-link message without exposing whether a guest record exists.
- **Mobile:** Status and next action appear first; long payment details remain readable and copyable.

#### 10. Reservation and contribution management

- **Goal:** Let owner and verified collaborator manage reservations and decide reported payments.
- **Content:** Separate reservation and payment-report lists; guest identity/contact visible only here to authorized members; contribution amount, gift, report time, and current status; no proof upload/view control.
- **Actions/navigation:** Release reservation; verify or reject reported payment; release an unpaid pledge early; update payment instructions; view activity history. Every consequential action asks for confirmation or reason where appropriate and records the acting member.
- **States:** Empty queues explain that no action is pending. Loading/error states are scoped to each list. Concurrent/repeated decisions show the latest status rather than silently overwriting. Verify updates collected progress; reject frees capacity and lets the guest report again. No automatic expiry for `payment_reported`.
- **Mobile:** Use compact cards rather than wide tables; keep guest contact details behind an explicit reveal; make verify/reject controls distinct and confirmation-backed.

### End-to-end navigation flows

**New registry owner:** Landing → create account → create registry → dashboard → add gifts → preview → publish/share → management.

**Returning owner/collaborator:** Landing → sign in → dashboard → management or gift editor. A partner receives an invitation and must verify their own account before dashboard access.

**Full gift reservation:** Shared registry link → public wishlist → available gift → choose full reservation → enter name/contact → reserve → private confirmation/status link. From the status link the guest may cancel that reservation.

**Contribution:** Shared registry link → public wishlist → available gift → choose contribution → enter amount/name/contact → pledge (72-hour expiry) → view offline instructions → report payment → private status link → verified or rejected; after rejection the guest may report again.

### Interaction and accessibility requirements

- Persisted business statuses and temporary interface states are separate. `reserved` is not a loading state; “gift no longer available” is a recoverable conflict outcome.
- Use inline errors next to fields and an error summary or announced message after failed submission. Move focus to the first invalid field or page heading when appropriate.
- Announce async outcomes (saved, copied, reservation conflict, payment reported) with an accessible live region; do not rely only on color or animation.
- Disable duplicate submissions while a request is pending, but never treat disabled UI as a substitute for server-side atomic checks.
- Respect reduced-motion preference. Keep all interactive behavior available without hover.
- Do not show demo/sample data as if it were the signed-in user’s real registry or real guest activity.

## Technical architecture

| Layer | Technology | Responsibility |
|---|---|---|
| Frontend | React + Vite + Tailwind CSS | Couple dashboard, public registry, guest actions |
| Authentication | Supabase Auth | Couple and collaborator accounts |
| Database | Supabase PostgreSQL | Registry data, constraints, transactional operations |
| Server operations | Supabase Edge Functions and PostgreSQL RPC | Guest writes, sensitive actions, atomic reservation and contribution allocation |
| Storage | Supabase Storage | Gift images only |
| Hosting | Vercel | Frontend deployment |
| Notifications | In-app notices and transactional email | Essential confirmations and updates |

Keep the application a modular React/Supabase monolith. Do not add a separate FastAPI backend, microservices, AI, or payment gateway for Phase 1. Never put the Supabase service-role key in the browser. Enable RLS on every application table; use trusted functions for guest writes, verification, releases, and other privileged operations. Validate all amounts and ownership relationships server-side. Apply rate limiting to public write operations and audit reservation releases and contribution decisions.

### Initial data areas

- Accounts and permissions: `users`, `registries`, `registry_members`.
- Gift management: `gifts`, `gift_categories`, `gift_images`.
- Guest activity: `guests`, `reservations`, `contributions`.
- Registry settings: `payment_settings`.
- Access and operations: `guest_access_tokens`, `audit_logs`, `notifications`.

Guest/contact data must not be publicly readable. A registry has one creator and may have an invited, verified partner collaborator with registry-management permissions. Public slug is an identifier, not a secret. The initial migration exposes published registry data through a safe read RPC; public reservation/contribution writes are granted only to the trusted `service_role`, so the frontend must call rate-limited Edge Functions and must never receive the service-role key.

## Implementation plan

### 1. UX and screen specification

- [x] Draft behavior for all 10 product areas, shared navigation, mobile layouts, forms, content, and interface states.
- [x] Document owner, collaborator, full gift reservation, and guest contribution journeys.
- [ ] Review the screen specification before connecting screens to real data.

### 2. Project and Supabase foundation

- [x] Set up the React + Vite + Tailwind foundation, hash-based prototype navigation, build command, and `.env.example`.
- [x] Implement browser-local demo flows for account sign-up/sign-in, registry creation, gift creation, guest reservation/contribution choices, and copying the registry link.
- [x] Add Supabase CLI project configuration and local Auth/redirect settings without adding credentials.
- [x] Define the initial schema, business states, indexes, constraints, and access rules.
- [x] Add the initial SQL migration with RLS policies, atomic guest operations, hashed guest tokens, audit records, and a 72-hour pledge expiry function.
- [x] Add pgTAP checks for core schema, RLS/grants, and protected guest operations.
- [x] Add a follow-up constraint migration enforcing one registry per owner; assert it in pgTAP.
- [ ] Re-run the updated migration and 36 database assertions in an isolated PostgreSQL-compatible test environment with Supabase API stubs.
- [x] Run the migrations and 36 pgTAP assertions against local Supabase.
- [x] Schedule stale-pledge expiry every 15 minutes and clean old rate-limit counters daily with `pg_cron`.
- [x] Add rate-limited Edge Function wrappers for reservation, pledge, cancellation, payment report, and guest-status operations.
- [x] Run all five Edge Functions through 20 local HTTP integration checks; verify reservation, pledge, status, cancellation, payment report, input/CORS errors, and capacity conflicts.

### 3. Supabase authentication, membership, and registry

- [x] Connect account sign-up/sign-in and session restoration to Supabase Auth; registry insertion creates the database owner membership.
- [ ] Implement partner invitation and verified collaborator access.
- [x] Implement registry create/edit/publish and public registry detail reads with a unique public slug.
- [ ] Implement gift/category/image management and public wishlist.

### 4. Reservations and contributions

- [ ] Enforce atomic exclusive reservation vs contribution mode and guest cancellation/member release.
- [ ] Add atomic contribution capacity allocation using verified + active pledges + payment-reported totals.
- [ ] Add 72-hour unpaid-pledge expiry and member-controlled early release.
- [ ] Add offline payment reporting, member verification/rejection, and rejected-payment resubmission with audit history.
- [ ] Add random, hashed, expiring, revocable guest tokens and status lookup.
- [ ] Add in-app notices and essential transactional email.

### 5. Verification and launch

- [ ] Test simultaneous reservations and contribution allocation at the target boundary.
- [ ] Test pledge expiry, early release, payment report, verification, rejection, and resubmission.
- [ ] Test RLS, collaborator permissions, guest token expiry/revocation, and privacy.
- [ ] Test responsive layouts, accessibility, errors, empty states, and user-facing copy.
- [ ] Deploy to Vercel and smoke-test full workflows in production.

## Acceptance criteria

- Exactly one concurrent guest can reserve a gift, and a reserved gift cannot also accept contributions.
- After contributions begin, the gift cannot be reserved in full; more contributions can be made only within the uncommitted value.
- Guests can cancel their own reservation; authorized registry members can release reservations.
- Group pledges cannot exceed target capacity when counting verified, active-pledged, and payment-reported amounts, including concurrent submissions.
- Unpaid pledges expire after 72 hours and release capacity; payment-reported contributions do not expire automatically.
- Only verified amounts count toward collected progress.
- Only verified registry members can verify/reject; rejected payments can be reported again without losing audit history.
- Guest links are random, hashed at rest, expiring, revocable, and restricted to one guest record.
- Public reads reveal no guest contacts, reservation identities, payment reports, or collaborator details.
- No payment evidence or payment gateway exists in Phase 1.

## Current implementation status

Without Supabase settings, the app retains its browser-local demo: sign-up/sign-in, registry creation, wishlist gift editing/priority, guest reservation/contribution examples, and link copying. With `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` configured, account sign-up/sign-in, session restoration, registry create/edit, publish/unpublish, and public wedding-detail reads use Supabase Auth and the existing RLS-protected schema. Session tokens are stored in the browser; only the public anon key belongs in frontend configuration. Gift CRUD, guest reservations/contributions, payment verification, and notifications are not yet wired to Supabase, and guest actions are disabled in Supabase mode so the UI does not claim those demo operations are persisted. Public registry reads require the database migration and a published registry. Local Supabase migrations and all 36 pgTAP assertions pass; Deno validation and 20 local HTTP integration checks across all five guest Edge Functions also pass. Docker Desktop was reinstalled and its Engine now runs successfully. The [developer guide](./PROJECT_GUIDE.md) records the current status. No remote Supabase project has been configured.

## Run and test locally

Requires Node.js 20.19+ or 22.12+.

```sh
npm install
cp .env.example .env.local
# Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local to use Supabase mode.
npm run dev
npm test
npm run build
npx deno test --allow-env supabase/functions/tests/public_api.deno.ts
npx supabase start
npx supabase test db
npx supabase functions serve --env-file supabase/functions/.env.local
```

The Vitest/Testing Library suite checks the browser-local demo flows. The Deno test covers CORS, request validation, database-backed throttling, and fail-closed behavior. These tests do not substitute for Supabase auth/database, authorization, concurrency, or end-to-end tests. After applying the migration, configure the local Supabase URL and anon key in `.env.local` and restart Vite; do not use the service-role key in the frontend.

The Supabase migration and database assertions are in `supabase/migrations/` and `supabase/tests/database/`. Run them with the Supabase CLI after installing Docker Desktop or Podman. Do not configure the service-role key in the Vite frontend.

For local Edge Function testing, copy `supabase/functions/.env.example` to `supabase/functions/.env.local`, generate a unique `RATE_LIMIT_HMAC_SECRET` of at least 32 bytes, and set `ALLOWED_ORIGINS` to the exact frontend origin(s). The local Supabase Edge Runtime provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; never expose the service-role key to the browser. Set `RATE_LIMIT_HMAC_SECRET` and `ALLOWED_ORIGINS` as Supabase function secrets before deployment. Guest endpoint limits are 10 requests/minute per IP for writes and 30/minute for status lookups; limiter failures fail closed. Status tokens are sent in POST bodies, not URLs.

Guest Edge Functions accept JSON `POST` requests: `create-reservation` (`giftId`, `guestName`, and exactly one of `email`/`phone`), `create-group-pledge` (the same fields plus numeric `amount`), `cancel-reservation` (`token`), `report-payment` (`token`), and `guest-activity` (`token`). Guest status is available only through the rate-limited function, not direct anonymous RPC access.
