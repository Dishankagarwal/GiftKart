# ShaadiLedger — Project and Developer Handoff

> **Audience:** developers, maintainers, and AI coding assistants continuing this repository. Read this file together with `README.md`, the source, migrations, and tests; source code and migrations are authoritative when behavior differs from this summary.
>
> **Last reviewed:** 2026-11-13

## 1. Product summary

ShaadiLedger is a personalized wedding gift wishlist for a couple. The couple creates one shared registry, adds gifts and priorities, and shares a public link. Each guest chooses whether to reserve a whole gift or contribute toward it. Guests pay the couple directly, outside the application, using UPI, bank transfer, or cash instructions. The couple records and verifies reported payments.

The guiding principles are:

- Make gifting straightforward for guests; guests do not create accounts.
- Show the couple who reserved a gift or reported a contribution.
- Enforce reservation, allocation, and authorization rules in PostgreSQL—not only in the browser.
- Do not collect or process money. There is no payment gateway.
- Clearly distinguish a pledge, a reported payment, and a verified payment.

### Phase 1 includes

- One owner account and one wedding registry per couple.
- Optional verified partner collaboration (database support exists; UI integration remains).
- Registry names, date, city, welcome note, unique slug, and draft/published state.
- Wishlist gifts with category, INR value, product link, and priority order.
- Guest choice of full reservation **or** contribution. The couple does not set a gift type.
- Direct/offline payment instructions and guest payment reporting.
- Couple review of reported payments; only verified amounts count as collected.
- Secure, account-free guest status links.
- Notifications, essential email, and WhatsApp sharing (WhatsApp notifications are excluded).

### Explicitly excluded

- Payment gateway or in-app collection.
- Surprise mode.
- Event-specific registries or separate bride/groom registries.
- Guest accounts.
- Payment-proof uploads.

## 2. Current implementation status

The project has two runtime modes:

1. **Browser-local demo** (default when no Supabase variables are configured): the existing React UI demonstrates account/registry creation, gift management and priority, guest reservation/contribution examples, and link copying. Data is saved in this browser only and is not authentication or a shared database.
2. **Supabase mode** (requires both `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`): account sign-up/sign-in, session persistence, registry create/edit, publish/unpublish, and public registry detail reads use Supabase. Gift management and guest actions are deliberately gated as “coming next” rather than pretending local demo actions persisted.

### Working in Supabase mode

- Supabase Auth email/password sign-up and sign-in.
- Email-confirmation response messaging when sign-up does not immediately return a session.
- Browser session storage, restore, refresh when an API request needs a fresh token, and sign-out.
- Create or edit registry details; creating the row lets the database trigger create its owner membership.
- Publish/unpublish and fetch a published registry by public slug through the safe database RPC.
- Local unit tests exist for Supabase auth and registry request mapping.

### Not yet connected to the frontend

- Gift/category CRUD, priority persistence, and gift image storage.
- Guest reservation and contribution creation; cancellation, payment reporting, and secure guest status lookups.
- Couple reservation/reported-payment management, contribution verification/rejection, and early release.
- Partner invitation and collaborator UX.
- Payment-instruction management and notifications.

The full database schema and most guest/member operations are already represented in SQL, and guest Edge Function wrappers exist, but this does not mean they have been applied or tested in a live Supabase instance. Supabase mode currently disables guest actions until those UI integrations are completed.

## 3. Product rules and data invariants

- A registry has exactly one owner and one registry per owner. The database enforces one registry per owner.
- Registry slugs are unique lowercase URL-safe strings. Registries start unpublished; a couple explicitly publishes them.
- Gifts have no reservation/contribution type; each guest chooses the giving method.
- A gift can have only one active full reservation. A reserved gift cannot accept contributions.
- Once contributions begin, full reservation is blocked. Further pledges are allowed only within the uncommitted gift value.
- Capacity includes verified, payment-reported, and unexpired pledged amounts. Only verified contributions count as collected.
- Pledges are positive, cannot overfund a gift, and expire after 72 hours unless payment has been reported.
- A rejected contribution does not count toward collected progress or capacity; a guest may report payment again, with history retained.
- A guest can cancel their own reservation; registry members may release reservations and unpaid pledges.
- Only verified registry members may verify/reject contributions or manage a registry.
- Collect a guest name and exactly one contact field (email or phone); keep guest data private.
- Guest confirmation tokens are random, hashed at rest, expiring, and revocable. Never put tokens in URLs or logs.
- Public registry reads must not expose guest details, reservations, payment reports, or collaborator data.
- Never expose a Supabase service-role key in the browser or commit credentials.

## 4. Architecture and repository map

### Frontend

- `src/main.tsx` mounts the React application and CSS.
- `src/App.tsx` contains hash-based routes, the browser-local demo model, the current Supabase-mode orchestration, forms, and screen components.
- `src/services/supabase.ts` contains the browser's Supabase Auth and PostgREST/RPC calls using `fetch` (the Supabase JavaScript client is not currently a dependency).
- `src/index.css` contains global and responsive UI styling.
- `src/App.test.tsx` covers demo UI flows and expected behavior.
- `src/services/supabase.test.ts` covers Supabase sign-up and registry creation request mapping.
- `src/vite-env.d.ts` supplies Vite environment variable types.
- `vite.config.ts` configures Vite, Tailwind, Vitest, and jsdom.

Screen hash names in `src/App.tsx`:

| Hash | Purpose | Supabase status |
|---|---|---|
| `#landing` | Product landing | Available |
| `#login` | Couple sign-in | Supabase Auth connected |
| `#create-account` | Couple registration | Supabase Auth connected |
| `#create-registry` | Create/edit wedding details | Supabase connected |
| `#dashboard` | Couple overview and sharing | Registry details connected; gift data not connected |
| `#edit-gift` | Add/edit gift | Demo only; gated in Supabase mode |
| `#public-registry?slug=...` | Public wishlist | Supabase registry/details read connected; gift rendering/actions still in progress |
| `#reserve-gift` | Guest full reservation | Demo only; gated in Supabase mode |
| `#contribute` | Guest contribution | Demo only; gated in Supabase mode |
| `#guest-status` | Guest's private status | Demo only; not wired |
| `#management` | Couple activity management | Demo placeholder |

### Supabase backend

- `supabase/config.toml` configures local project `shaadiledger`, Postgres 17, API/Auth/Storage ports, and local redirect origins.
- `supabase/migrations/20261110000000_initial_schema.sql` defines the Phase 1 schema, business functions, RLS/grants, storage policies, and two scheduled jobs.
- `supabase/migrations/20261113000000_one_registry_per_owner.sql` adds the owner uniqueness constraint.
- `supabase/tests/database/initial_schema.test.sql` contains 36 pgTAP assertions and runs in a rollback transaction.
- `supabase/functions/_shared/public_api.ts` provides guest-request validation, CORS, IP-based rate limiting, service RPC calls, and error mapping.
- `supabase/functions/create-reservation/index.ts` calls `create_guest_reservation` (10 writes/minute/IP).
- `supabase/functions/create-group-pledge/index.ts` calls `create_group_pledge` (10 writes/minute/IP).
- `supabase/functions/cancel-reservation/index.ts` calls `cancel_guest_reservation` (10 writes/minute/IP).
- `supabase/functions/report-payment/index.ts` calls `report_guest_payment` (10 writes/minute/IP).
- `supabase/functions/guest-activity/index.ts` calls `get_guest_activity` (30 status lookups/minute/IP).
- `supabase/functions/tests/public_api.deno.ts` tests shared Edge Function request behavior.

## 5. Database model

The initial migration creates 13 application tables in `public` and a private rate-limit table:

| Table | Responsibility |
|---|---|
| `profiles` | Auth-linked display name and profile timestamps |
| `registries` | Owner, couple names, date, city, welcome note, unique slug, publication state |
| `registry_members` | Owner/partner roles and invitation/active/revoked membership |
| `gift_categories` | Registry-specific gift categories and ordering |
| `gifts` | Gift description, INR target, external URL, active state, priority/order |
| `gift_images` | Private Storage object paths and alt text |
| `guests` | Name and one email-or-phone contact per registry |
| `reservations` | Full-gift reservations and cancellation/release state |
| `contributions` | Pledged/payment-reported/verified/rejected/expired/released amounts |
| `payment_settings` | Couple's UPI, bank, cash, and general instructions |
| `guest_access_tokens` | Hashed, expiring, revocable guest access tokens |
| `audit_logs` | Reservation, contribution, and membership event history |
| `notifications` | Registry-member notifications and read state |
| `private.public_api_rate_limits` | HMAC-keyed counters for public Edge Function request limits |

Notable SQL functions include:

- Auth/member setup: `handle_new_auth_user`, `add_registry_owner_member`, `is_registry_member`, `is_registry_owner`.
- Safe guest read/write operations: `get_public_registry`, `create_guest_reservation`, `create_group_pledge`, `get_guest_activity`, `cancel_guest_reservation`, `report_guest_payment`.
- Couple operations: `review_contribution`, `release_reservation`, `release_unpaid_pledge`, `invite_registry_partner`, `accept_registry_invitation`, `revoke_registry_partner`.
- Operations: `expire_stale_pledges`, `consume_public_rate_limit`.

Postgres RLS is enabled on every application table. Anonymous guest writes are not granted direct RPC access; trusted Edge Functions call write RPCs using the service role. The service role must remain server-side. Anonymous public registry details are returned through `get_public_registry` only for published slugs.

`pg_cron` schedules unpaid pledge expiry every 15 minutes and rate-limit counter cleanup daily. Confirm the full cron SQL and migration behavior by applying the migration in local Supabase; the schedule definitions have not yet been verified in a running local stack.

## 6. Local setup

### Requirements

- macOS Apple Silicon or Intel.
- Node.js 22.12+ (Node.js 22 LTS is preferred; Vite's Node requirement is higher than 20.0).
- Docker Desktop running for `supabase start` and database tests.
- Internet for initial npm packages and Supabase container images.

Node.js and npm were installed for the current macOS user under `~/.local/share/nodejs`; command links are in `~/.local/bin`. In a new terminal, run:

```sh
export PATH="$HOME/.local/bin:$PATH"
node --version
npm --version
```

The zsh login profile `~/.zprofile` now includes `export PATH="$HOME/.local/bin:$PATH"`. Opening a new terminal makes `node` and `npm` available without a manual PATH export.

Docker Desktop was uninstalled and reinstalled from Docker's official Apple silicon disk image after its Engine repeatedly failed to start. Docker Desktop `4.99.0` and Engine `29.9.3` now start successfully; `docker info` reports a healthy Server section. The install preserved `~/.docker` CLI configuration. Supabase has been started locally and its database tests now pass. Docker's official uninstaller reported a macOS permission restriction on its container metadata file; Docker documents this as a possible error that can be ignored. No Docker VM disk/container data existed before reinstall.

```sh
open -a Docker
/Applications/Docker.app/Contents/Resources/bin/docker info
```

The second command must show a working **Server** section before running Supabase. Docker Desktop may need a first-run confirmation, permissions, or a macOS sign-in action. If `docker` is not on PATH, use the bundled CLI path above, or configure Docker Desktop to install command-line links.

### Frontend

From the repository root:

```sh
export PATH="$HOME/.local/bin:$PATH"
npm install
cp .env.example .env.local
# Leave the Supabase variables blank for the browser-local demo.
# To use a real/local Supabase project, set the project URL and public anon key.
npm run dev
npm test
npm run build
```

Vite runs at `http://localhost:5173` by default. Local `.env.local` is ignored by git. Only put `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in frontend configuration. Never put `SUPABASE_SERVICE_ROLE_KEY` there.

For browser-local demo mode, leave both variables blank. Supabase mode requires both variables; if only one is present, the app shows a configuration error rather than silently falling back to demo mode.

### Local Supabase

Start Docker Desktop first, then from the repository root:

```sh
export PATH="$HOME/.local/bin:$PATH"
npx supabase start
npx supabase status
npx supabase test db
```

The initial database is empty until migrations are applied by the local Supabase startup/reset flow. `supabase status` prints local API URL and public keys; copy the local API URL and anon key to `.env.local`, restart Vite, then create an account/registry. A fresh local database has no pre-existing wedding registry.

To run the guest Edge Functions locally, copy the template and set the local-only secrets:

```sh
cp supabase/functions/.env.example supabase/functions/.env.local
```

Set `RATE_LIMIT_HMAC_SECRET` to a random secret of at least 32 bytes and `ALLOWED_ORIGINS` to the exact local frontend origin, such as `http://localhost:5173`. The Supabase Edge Runtime provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Keep these server-only and uncommitted. Then run:

```sh
npx supabase functions serve --env-file supabase/functions/.env.local
```

Use the local Supabase outputs for local testing only. Do not copy secret values into this document, source files, screenshots, issue descriptions, or AI prompts.

## 7. Validation status and commands

Most recently observed during this work:

- Node.js `v22.23.5` and npm `10.9.9` were installed in the user home directory and are runnable when `~/.local/bin` is on PATH.
- `~/.zprofile` was updated so new zsh login terminals include the user-local Node.js tools in PATH.
- `npm test` passed: 27 tests across the UI and Supabase client test files.
- `npm run build` passed: TypeScript check and Vite production build succeeded.
- The UI tests were made deterministic by selecting the intended gift card and resetting the hash route after prior queued browser events.
- Editor diagnostics reported no TypeScript issues in the changed app and Supabase files.
- `git diff --check` passed during the changes.
- Supabase CLI `3.1.0` is available via `npx supabase`.
- Docker Desktop `4.99.0` and Docker Engine `29.9.3` are installed and running on Apple silicon.
- `npx supabase start` succeeded; all 12 local Supabase containers started, with the database and supporting services healthy.
- `npx supabase test db` passed all 36 pgTAP assertions in `supabase/tests/database/initial_schema.test.sql`.
- `npx deno test --allow-env supabase/functions/tests/public_api.deno.ts` passed the request validation, CORS, body-size, rate-limit, and fail-closed unit checks.
- All five guest Edge Functions passed 20 local HTTP integration checks: reservation and cancellation, contribution pledge and payment reporting, guest status privacy, invalid inputs, CORS/method rejection, reservation/contribution conflicts, and pledge capacity. Temporary test records and the generated local function secret were removed.
- Hosted Supabase Auth/registry flows and browser integration with guest endpoints remain unverified; no remote Supabase project has been configured.

Run the frontend suite and build:

```sh
export PATH="$HOME/.local/bin:$PATH"
npm test
npm run build
```

Run database and Edge Function checks after Docker is ready:

```sh
npx supabase start
npx supabase test db
npx supabase functions serve --env-file supabase/functions/.env.local
```

The pgTAP plan currently declares 36 assertions. If adding/removing assertions, update `select plan(...)` and verify the actual count.

## 8. Recommended continuation roadmap

Complete work in small vertical slices, keeping the browser-local demo working:

1. **Local backend validation (complete):** Docker Engine and the local Supabase stack run; migrations apply, all 36 pgTAP assertions pass, the Deno request/rate-limit test passes, and all five Edge Functions pass local HTTP integration checks.
2. **Configure local app connection:** use the URL and anon key from `npx supabase status` in ignored `.env.local`; test email-confirmation and sign-in flows against local Auth. Verify account session restore, sign-out, create/edit registry, publishing, and public slug fetch.
3. **Connect gift/category management:** persist gift records and sort order with RLS; preserve gift product links and category; test editing/reordering and public read. Handle unique slug collisions and one-registry constraints with actionable form errors.
4. **Connect guest workflows:** wire existing create-reservation/create-group-pledge Edge Functions, private status/cancel/report endpoints, and secure token hand-off. Do not call privileged RPCs directly from the browser.
5. **Connect member management:** query guest reservations/reports under RLS; wire release and contribution review. Only verified contribution values count as collected.
6. **Payment instructions and UI polish:** configure/read offline instructions securely; add clear loading/error/retry states, responsive and accessibility checks, notifications as scoped.
7. **Security/concurrency checks:** test public privacy/RLS, tokens, collaborator role boundaries, parallel reservations, amount allocation limits, pledge expiry, report/review/rejection/re-report transitions.
8. **Deployment:** configure production Supabase Auth redirects, function secrets/CORS, storage policies, and hosting environment; run production smoke tests. Do not deploy until the authorization and concurrency requirements pass.

## 9. Guidance for AI assistants and contributors

- Read this guide and the relevant code before proposing or editing.
- Treat product scope and database constraints above as requirements. In particular, do not add a gift-type selector, payment gateway, proof upload, or guest account without an explicit product decision.
- Prefer small, end-to-end slices with tests. Keep all demo behavior available when Supabase configuration is absent.
- Do not silently fall back from a configured-but-failing Supabase project to localStorage; show the service error.
- Keep identity and business rules server-authoritative. The UI can improve feedback but cannot replace RLS, unique constraints, atomic RPCs, or server validation.
- Do not broaden public reads. Guest identity, contacts, member records, payment settings, and activity must remain private.
- Never put service-role credentials, guest tokens, passwords, rate-limit secrets, or private account data in frontend bundles or committed documentation.
- Use clear loading, empty, unavailable, conflict, and success states; do not display a demo success for a failed database operation.
- Update relevant tests and documentation when behavior changes. Validate with `npm test`, `npm run build`, and `npx supabase test db` as applicable.
- Existing working-tree changes may belong to the user or prior tasks. Inspect `git status` and diffs before editing; do not discard unrelated changes or amend commits unless explicitly asked.
