# ShaadiLedger

ShaadiLedger is a personalized wedding gift registry. It helps couples publish a wishlist and lets guests reserve gifts or contribute toward group gifts using offline payments.

> Product principle: Make gifting effortless for guests and gift management effortless for couples.

## Phase 1 scope

### Included

- Couple account and one registry for the couple.
- Registry owner can invite one partner as a collaborator. Both verified members can manage the registry.
- Wedding names/date, welcome message, unique public link, publish/unpublish, and share.
- Gifts with categories, prices or targets, images, external links, and individual/group types.
- Individual gifts can be reserved by one guest at a time. Guest can cancel their own reservation; a couple member can release it.
- Guests contribute to group gifts through offline UPI, bank transfer, or cash instructions. No payment gateway or proof upload.
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
2. Reserves an available individual gift or pledges an amount toward a group gift.
3. Pays the couple offline using the displayed instructions.
4. Reports the payment and receives a secure link to check the contribution status.

## Product and business rules

### Individual reservations

- A gift can have at most one active reservation. PostgreSQL must enforce this atomically; frontend availability checks are not sufficient.
- Guests can cancel only their own reservation. Registry members can release a reservation.
- A cancelled or released reservation makes the gift available again.
- Reservation identity and contact information are visible only to authorized registry members and the guest through a secure confirmation link.

### Group contributions

- **Overfunding is disabled.** Available capacity is the gift target minus verified contributions, active pledges, and payment-reported contributions.
- Creating a pledge reserves capacity. The amount must be positive, valid, and within remaining capacity; allocation must be atomic under concurrent requests.
- An unpaid pledge expires after 72 hours and releases its reserved capacity. A registry member may release a pledge earlier. Guests cannot cancel pledges.
- Once payment is reported, the contribution does not expire automatically and continues to count against capacity until verified or rejected.
- Only verified contributions count as collected. Pledged and payment-reported amounts reserve capacity but do not count as collected progress.
- A rejected contribution does not count toward collected progress or capacity. The guest can report the payment again after checking the payment instructions; previous status changes remain in the audit history.
- Guests cannot verify, reject, or cancel contributions. Only verified registry members can verify or reject.
- If an offline refund is required, the couple handles it outside the application.

### Guest access and privacy

- Guests do not need accounts. Collect only their name and one contact method (email or phone).
- Guest confirmation links use cryptographically random tokens; store only token hashes. Tokens expire and can be revoked.
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
| 5 | Add / edit gift | Couple | Manage individual or group gifts, images, categories, links, and target amounts. |
| 6 | Public wedding wishlist | Guest | Browse published gifts and their availability/progress. |
| 7 | Gift details and reservation | Guest | Reserve an individual gift with name and one contact method. |
| 8 | Group contribution and payment instructions | Guest | Pledge an amount, view offline instructions, and report payment. |
| 9 | Contribution confirmation and status | Guest | Confirm submission and securely check reservation/contribution status. |
| 10 | Reservation and contribution management | Couple | Release reservations and review, verify, or reject reports. |

Every screen needs loading, empty, error, and success behavior as appropriate. Gift-unavailable is a business outcome shown by the interface, not a generic loading/error state. Design mobile-first and include keyboard, focus, validation, and accessible-label behavior.

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

Keep the application a modular React/Supabase monolith. Do not add a separate FastAPI backend, microservices, AI, or payment gateway for Phase 1. Never put the Supabase service-role key in the browser. Enable RLS on every application table; use trusted functions for guest writes, verification, releases, and other privileged operations. Validate all amounts and ownership relationships server-side. Add rate limiting/bot protection to public write operations and audit reservation releases and contribution decisions.

### Initial data areas

- Accounts and permissions: `users`, `registries`, `registry_members`.
- Gift management: `gifts`, `gift_categories`, `gift_images`.
- Guest activity: `guests`, `reservations`, `contributions`.
- Registry settings: `payment_settings`.
- Access and operations: `guest_access_tokens`, `audit_logs`, `notifications`.

Guest/contact data must not be publicly readable. A registry has one creator and may have an invited, verified partner collaborator with registry-management permissions. Public slug is an identifier, not a secret.

## Implementation plan

### 1. UX and screen specification

- [ ] Specify each of the 10 screens, navigation, mobile layout, forms, content, and interface states.
- [ ] Confirm user flows for owner, collaborator, individual gift guest, and group contribution guest.
- [ ] Review the screen specification before connecting screens to real data.

### 2. Project and Supabase foundation

- [x] Set up the React + Vite + Tailwind foundation, hash-based prototype navigation, build command, and `.env.example`.
- [ ] Configure Supabase project and local development environment without committing secrets.
- [ ] Define schema, state transitions, indexes, constraints, and access matrix.
- [ ] Add migrations and RLS policies; test authorized and denied access.

### 3. Authentication, membership, and registry

- [ ] Implement couple registration/login and owner membership.
- [ ] Implement partner invitation and verified collaborator access.
- [ ] Implement registry create/edit/publish and unique public slug.
- [ ] Implement gift/category/image management and public wishlist.

### 4. Reservations and group gifting

- [ ] Add atomic individual reservation, guest cancellation, and member release.
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

- Exactly one concurrent guest can reserve an individual gift.
- Guests can cancel their own reservation; authorized registry members can release reservations.
- Group pledges cannot exceed target capacity when counting verified, active-pledged, and payment-reported amounts, including concurrent submissions.
- Unpaid pledges expire after 72 hours and release capacity; payment-reported contributions do not expire automatically.
- Only verified amounts count toward collected progress.
- Only verified registry members can verify/reject; rejected payments can be reported again without losing audit history.
- Guest links are random, hashed at rest, expiring, revocable, and restricted to one guest record.
- Public reads reveal no guest contacts, reservation identities, payment reports, or collaborator details.
- No payment evidence or payment gateway exists in Phase 1.

## Current implementation status

The React/Vite/Tailwind project foundation and a navigable, mobile-first visual prototype for the 10-screen inventory are in place. It uses static sample content only; sign-in, saving, reservations, contributions, and verification are not connected. Next: review the screen flows, then implement the Supabase schema and access policies before connecting real actions.

## Run and test locally

Requires Node.js 20.19+ or 22.12+.

```sh
npm install
npm run dev
npm test
npm run build
```

The Vitest/Testing Library suite checks all 10 screen routes, account-to-registry navigation, the individual reservation and group contribution guest journeys, and access to couple gift management. The UI tests cover prototype navigation only; they do not substitute for database, authorization, concurrency, or end-to-end tests once Supabase is connected.
