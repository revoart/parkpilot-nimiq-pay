# ParkPilot

**Find parking. Pay with USDT. Park with confidence.**

ParkPilot is a Nimiq Pay Mini App that makes finding and paying for parking
simple. Drivers discover nearby parking, reserve a time window, and pay in
**USDT on Polygon** with a single confirmation in Nimiq Pay. Every payment is
verified on-chain by the backend before a reservation is confirmed.

Built for the **Nimiq Mini Apps Competition**.

---

## Problem

Paying for parking is fragmented: apps require accounts, card details, and
minimum spend, and the whole experience feels like a form. Meanwhile, wallets
already hold digital dollars that could pay instantly.

## Solution

A parking-first mini app that lives inside the wallet you already have:

1. Open ParkPilot inside Nimiq Pay.
2. Connect your wallet (EVM account).
3. Search or browse parking near you.
4. Pick a date and time.
5. Review the price.
6. Pay with USDT — confirm in Nimiq Pay.
7. The backend verifies the Polygon transaction.
8. Receive a confirmed parking pass.

Blockchain makes the payment better, not the experience more complicated.

---

## Features

- **Discovery** — list and map views, distance sorting, search, geolocation.
- **Parking details** — photo, address, price, type, amenities, **drive ETA with
  live traffic, and the walk to your destination** — all before you pay.
- **In-app navigation** — drive to the parking space, then walk to your actual
  destination, with live ETA, turn-by-turn instructions, spoken prompts and
  off-course rerouting, without leaving ParkPilot.
- **Reservations** — date/time picker, live price breakdown, availability lock.
- **USDT payments** — ERC-20 `transfer` encoded with viem, Polygon mainnet.
- **On-chain verification** — backend confirms chain, token, sender, recipient,
  amount, and receipt status before confirming.
- **Parking pass** — confirmed pass, receipt, and Polygonscan link.
- **My Parking** — upcoming, active, and past reservations.
- **Cancellation** — cancel up to 1 hour before the start time; a cancelled
  slot is released immediately. Paid bookings are flagged as refund-owed (USDT
  moves wallet-to-wallet, so the platform cannot reverse it automatically).
- **Expiry** — unpaid reservations release their slot after 15 minutes, so
  abandoned checkouts never block inventory.
- **Find My Car** — save where you parked and walk back to it, with a real
  routed walking distance from wherever you are now.
- **Privacy notice** and anonymous, minimal analytics.

---

## Park → Walk → Arrive

Parking is not the destination. ParkPilot keeps two locations apart — where the
car goes, and where the driver is actually going — and makes the walk between
them the headline number.

- **Destination** travels in the URL (`?name=&lat=&lng=`) from search → detail →
  reserve → payment, then is snapshotted onto the reservation
  (`destination_name / destination_address / destination_lat / destination_lng`)
  so it survives after payment. Browsing without a destination is still fully
  supported and stores nothing.
- **Drive and walk times are shown before any payment.** `/parking/:id` renders
  `JourneySummary` — `18 min drive · live traffic` and `10 min walk` — using the
  driver's current location for the drive leg and the parking space for the walk
  leg. No reservation or wallet connection is needed to see them.
- **Walking routes** prefer the Routes API (`WALK`) with real pedestrian
  geometry; `DistanceMatrixService` is still used for the search result list
  (**one request, never one per marker**). Cached in memory by coordinate
  (`src/lib/routing`).
- A straight-line fallback is only ever shown **labelled as an estimate** (`~`,
  "est."). It is never presented as an exact walking route.
- Reusable pieces: `JourneySummary`, `ParkingToDestination` (the Park → Walk →
  Arrive stepper), `DestinationCard`, `WalkBadge` — used on search, detail,
  reserve, payment, pass and session.

### In-app navigation

Navigation happens **inside ParkPilot** at `/navigate/:id`. The pass and session
screens keep an "Open in Google Maps" link as a deliberate escape hatch, but it
is no longer the primary action.

The journey runs as one continuous session:

1. **Drive to parking** — live position, traffic-aware ETA, turn-by-turn
   instructions, spoken prompts, off-course rerouting.
2. **You've arrived** — ParkPilot detects arrival, then offers
   **Start Walking** with the walk time and distance.
3. **Walk to the destination** — the same navigation surface, switched to
   pedestrian routing.

Architecture (`src/lib/routing`, `src/hooks`):

| Piece | Responsibility |
| --- | --- |
| `routesApi.ts` | Google Routes API `computeRoutes` — traffic-aware driving, real walking routes, per-step navigation instructions |
| `directions.ts` | Legacy `DirectionsService` fallback (still traffic aware) |
| `drive.ts` / `walking.ts` | The three-layer chain, caching and de-duplication |
| `polyline.ts` / `geometry.ts` | Pure decoding, projection, progress and off-route maths |
| `useLiveLocation` | Throttled `watchPosition` with heading, speed and accuracy |
| `useNavigation` | The state machine: routing, rerouting, arrival, voice triggers |
| `useVoiceGuidance` | `speechSynthesis` prompts, mute persistence, autoplay handling |

**Navigation states are explicit** (`idle`, `locating`, `route-loading`,
`route-ready`, `navigating`, `rerouting`, `arrived`, `walking-route-ready`,
`walking`, `destination-arrived`, `location-denied`, `route-error`) — there are
no scattered boolean flags.

**Cost control.** A route is *never* requested per GPS fix. The origin is frozen
when the route is built and only moves on an explicit reroute, which is
additionally rate-limited to once per 12 s after two consecutive off-course
fixes. Routes are cached for 90 s (driving) / 10 min (walking).

**Voice.** Instructions are spoken only when the driver crosses a distance band
(400 m / 150 m / 45 m driving, 120 m / 30 m walking), and the same phrase is
never repeated inside 9 s. Speech is muted by default on browsers that block
autoplay — the UI then shows **Enable Voice Navigation**.

**Honest limits.** Camera rotation needs a vector Map ID that actually engages
(`VITE_GOOGLE_MAPS_MAP_ID`); without one the map stays raster and the heading is
conveyed by the position arrow instead. The web build cannot offer native
Google Navigation SDK turn-by-turn — that would require packaging the app for
Android/iOS.

Navigation never swaps the two locations: the driving leg targets the **parking
coordinates**, the walking leg targets the **destination coordinates**.

**ParkPilot Pick** is a deterministic 50/50 blend of price and walking time
across the visible results (minimum 3 candidates). It is a ranking, not AI, and
it never auto-selects a space — the driver decides price vs walking convenience.

---

## Nimiq Pay integration

ParkPilot uses **both** injected providers:

| Provider | Used for |
| --- | --- |
| **Nimiq provider** (`@nimiq/mini-app-sdk` → `init()`) | Wallet identity: `listAccounts()` + `sign()` on a server-issued challenge |
| **Ethereum provider** (`window.ethereum`) | Accounts, Polygon chain switch, balances, and the USDT payment |

Nimiq address and EVM address are treated as **separate identities** and are
never mixed. The Nimiq signing flow is secondary and non-blocking — it can never
break parking or payment.

When opened outside Nimiq Pay, the app shows a clear message and keeps the
non-wallet UI usable.

---

## Wallet authentication

Every write operation (booking, cancelling, creating/editing/deleting a
listing, setting availability) is authorized by a **wallet signature**:

1. The app requests a one-time **EIP-712 challenge** (`auth-challenge`).
2. The user signs it in Nimiq Pay (`eth_signTypedData_v4`).
3. `auth-verify` recovers the signer with viem and issues a short-lived
   **HMAC session token** (12 h).
4. Write calls send that token; the Edge Function derives the acting wallet
   **from the token, never from the request body**.

So a caller can only act as a wallet they actually control. Challenges are
single-use and expire after 10 minutes.

## USDT payment architecture

- **Chain**: Polygon mainnet (`0x89` / 137)
- **Token**: USDT (PoS) — `0xc2132D05D31c914a87C6611C10748AEb04B58e8F`
- **Decimals**: 6

The transfer is a standard ERC-20 call:

```
to:    USDT contract        (not the recipient)
value: 0x0
data:  transfer(recipient, amount)   // encoded with viem, bigint amounts
```

### Verification flow

1. `create-reservation` validates availability and inserts a **pending**
   reservation.
2. The wallet sends the transaction; the hash is returned.
3. `verify-usdt-payment` fetches the receipt from a Polygon RPC and checks:
   chain, token contract, receipt success, sender, recipient, and amount.
4. Only then are the payment and reservation marked **confirmed**.
5. Verification is **idempotent** — a transaction hash is unique and never
   processed twice.

A reservation is **never** marked paid from a frontend callback alone.

> **Gas**: USDT on Polygon is not gasless. Users need a small amount of POL.
> ParkPilot warns when the POL balance looks insufficient.

### Free ($0.00) listings

`parking_spaces.price_usdt` allows `0`. A zero-total reservation is **free**:
`create-reservation` inserts it as `reservation_confirmed` with no payment
window, writes no payment or ledger rows, and returns `free: true`. The app skips
the payment screen and goes straight to the pass, so the post-reservation flow
can be exercised without any on-chain transaction or gas.

A demo row is seeded by `0010_free_test_listing.sql`
(*"Free Test Spot (Demo)"*, Toronto).

---

## Treasury, ledger and host payouts

**No private key is ever stored, transmitted, or used by the app.** Signing
always happens in the user's wallet through the Nimiq Pay provider. That is what
"non-custodial" means here - and it is worth being precise about the rest:

> **Host earnings are custodied by the platform.** Drivers pay the treasury
> address, so accrued host earnings sit in the ParkPilot treasury wallet until a
> payout is made. Payouts are **manual** - an operator sends them from the
> treasury using their own wallet. This is a deliberate, documented custody
> model, not a claim that funds never touch the platform.

- Drivers pay the **ParkPilot treasury** address (`platform_settings.treasury_address`).
- On verification the ledger is credited **idempotently** (unique on
  `payment_id` + `entry_type`): the host's **earning** (gross - fee) and the
  treasury's **fee**.
- The platform fee is `platform_fee_bps` in `platform_settings` (default
  `1000` = 10%) - never hardcoded in the app.
- Host balances are **derived from ledger entries**, never a mutable counter:
  `available = earned - withdrawn - in-flight payouts`.

### Requesting a payout

`request-payout` calls the `request_payout` Postgres function, which **locks the
host's ledger account** while it computes the balance and inserts the request.
A read-then-insert would let two concurrent requests both pass the check and
over-request the same funds, so the check and the insert are one transaction.

### Settling a payout (operator runbook)

Payouts are sent by a **local script**, not by the server. The treasury key stays
on the operator's machine and no deployed function can read it:

```bash
node --env-file=.env scripts/send-payout.ts <payout_id> [--dry-run] [--resume]
```

The script derives the account from `TREASURY_MNEMONIC_FILE` (a path, preferred)
or `TREASURY_MNEMONIC`, signs in as that wallet, and then:

1. **Asserts the key matches the treasury.** The address derived from the phrase
   must equal `platform_settings.treasury_address`, or it refuses before claiming
   anything. A wrong phrase, a wrong derivation path or a stale config is caught
   here rather than by sending funds from an unexpected wallet.
2. **Claims** the payout via `claim_payout_for_send`, which enforces the kill
   switch, the per-payout and rolling-24h caps, and single-flight — in one
   statement, so two operators cannot both take the same payout.
3. **Checks balances** for both USDT and POL before spending a nonce.
4. **Signs, then persists the signed transaction and its hash** via
   `record-payout-send` — *before* broadcasting.
5. Broadcasts, waits for the receipt, and calls `mark-payout-paid`, which
   re-verifies the transfer on-chain before settling.

**Step 4 is the whole point.** A signed transaction is deterministic — same
bytes, same hash — so if the process dies between broadcasting and recording,
`--resume` re-broadcasts the identical bytes instead of signing a fresh
transaction and paying twice. Without it, every retry is a potential
double-spend.

`--dry-run` builds and signs but never broadcasts, so the path can be tested
without spending. `fail-payout` clears a claimed payout that has no transaction
(it refuses if one exists, so a broadcast send must be settled rather than
written off).

`mark-payout-paid` **verifies the transfer on-chain before settling**: it
fetches the receipt and asserts the transaction succeeded and contains a USDT
transfer from the treasury to the host's payout address for **at least** the
payout amount. A mistyped hash, a failed transaction, a wrong recipient or an
underpayment are all rejected, so a payout can never be marked paid in the books
while no money moved. One transaction hash can settle **only one** payout.

Hosts can verify their own payouts: the host wallet lists each withdrawal with a
**View transaction** link to the block explorer.

#### Arming it

Sending is **off by default**. `platform_settings.payouts_enabled` must be set to
`true` before anything can be claimed, so a misconfigured deploy cannot move
funds on its own. Caps live alongside it: `max_payout_usdt` (default 100) and
`daily_payout_cap_usdt` (default 500).

#### Secrets

`npm run check:secrets` scans every tracked and untracked-not-ignored file for a
BIP-39 phrase or a private key, and runs first in `npm run verify` and in CI. It
is content-based rather than path-based on purpose: `.gitignore` only protects a
file that happens to be named correctly, which is the assumption that fails in
practice. A deliberate exception is marked inline with `check-secrets:allow`.

Keep the phrase **out of `.env`** — that is the file most likely to be copied
into a build context, and this project lives under a synced folder. A file
outside the repo (`TREASURY_MNEMONIC_FILE`) is better.

### Known limitations

- One treasury wallet holds all host earnings and fees. There is no multisig or
  hardware-wallet separation — a key compromise is a total loss. A dedicated
  payout wallet holding only a float would cap the blast radius.
- The mnemonic is a hot key on the operator's machine. The stronger design is a
  KMS/HSM-backed signer, where the key never exists in a runtime at all.
- Sends are operator-triggered rather than automatic on request. Automating that
  step would remove the last human check.

## Listing photos (exactly one, mandatory)

Every active listing has **exactly one** photo. No galleries, no carousels.

- **Schema**: a single `parking_spaces.image_url`. The older `parking_space_photos`
  table (which models multi-photo galleries) is deliberately unused.
- **Storage**: a public `parking-photos` bucket. Objects live under the owner's
  wallet address (`{owner}/{uuid}.{ext}`) so ownership can be proven from the
  path. Reads are public; **writes only happen through Edge Functions** with the
  service role — the anon client has no storage write access.
- **`upload-parking-photo`**: token-authenticated, verifies the caller owns the
  listing, validates MIME type, size (≤5 MB) **and magic bytes** (a renamed file
  is rejected), then **deletes the object it replaces** so a listing can never
  accumulate a second photo.
- **Enforced server-side**, not just in the UI:
  - `create-parking-space` requires an `image_url` under the caller's own prefix.
  - `update-parking-space` refuses to clear the photo while the listing is active.
  - `delete-parking-space` removes the stored object.
- **UI**: a required **Parking photo** step in Host → Add (publish stays disabled
  until a valid photo exists, with *"Add a photo of your parking space to
  continue."*), and Replace / remove-with-replacement on Host → Edit.
- The same image is rendered by one shared `ListingPhoto` component across search,
  discovery, saved, host listings, the home carousel and the detail screen, with
  a subtle branded placeholder when a legacy row has no photo.

Seeded demo listings are backfilled with free-license stock parking photos
(Pexels License — free for commercial use, no attribution required).

## Account & identity

`/profile` is wallet-first and shares **one identity** between Driver and Host
(`profiles.display_name`, `profiles.bio`, `profiles.avatar_url`, served by
`get-profile` / `update-profile` / `upload-avatar`). Changing the name, bio or
photo in one mode updates the other.

The **wallets stay separate**: Driver shows the spending wallet (USDT/POL,
address, manage), Host shows the earnings wallet (available / pending / total
earned + Withdraw). They are never merged or presented as one balance.

---

## Driver ↔ host messaging

Drivers and hosts can message each other about a booking, and optionally share a
phone number for a direct call.

**A thread belongs to a reservation, not to a pair of wallets.** That is the
authorization boundary: you may read or post only if you are the reservation's
driver, or the owner of the parking space it booked (`_shared/chat.ts`,
`loadThread`). It also means a host can only be contacted by someone who
actually booked, so a listing never becomes a way to cold-message its owner. A
non-participant gets the same 404 as a missing reservation, so thread ids cannot
be probed.

| Piece | Where |
|---|---|
| `conversation_messages` | One row per message, scoped to a reservation |
| `conversation_reads` | A read cursor per participant, which is what drives unread counts |
| `conversation_summaries()` | Migration `0019`; last message + exact unread count per thread |
| `list-conversations` / `list-messages` / `send-message` | Edge Functions |

**There is no live push, and that is a deliberate trade.** The app has no
Supabase Auth session — it authenticates with an EIP-712 signature and an HMAC
token — so Realtime has no JWT for RLS to authorise a private channel against,
and a public channel would expose private messages and phone numbers. Chat
therefore polls a cursor while the thread is open (`useChat`): 4s interval, only
while the tab is visible, and each poll returns only what is new.

**The cursor is passed through verbatim.** Postgres stores microseconds and
JavaScript only milliseconds, so round-tripping a cursor through `Date` truncates
it and then re-matches the very message it points at — every poll would return
that message again. The client stores the server's `next_cursor` and sends it
back untouched.

Sends are capped at 20 per wallet per minute, and messages at 2000 characters.

### Phone contact

`profiles.phone` plus an explicit `profiles.phone_shared` opt-in, off by
default. A number is released to a counterparty **only when its owner has opted
in AND the booking is still active** (`bookingIsActive`), so a completed booking
cannot become a permanent directory entry. Chat works either way, so declining
to share a number never blocks communication.

Numbers are stored in one canonical shape — an optional leading `+` and 8–15
digits — and the `tel:` href is rebuilt from those digits rather than
interpolated from raw input, so nothing a user typed can reach the URL
(`src/utils/phone.ts`). A cleared number also clears the sharing flag, so a
later number cannot become visible without a fresh opt-in.

**Known unknown:** whether `tel:` opens the system dialer from inside Nimiq
Pay's WebView. It may be intercepted or open an in-app browser. This needs a
device test; the link is a plain anchor so it degrades to doing nothing if the
WebView ignores it.

---

## Design system

The interface implements the **"Parkpilot nimiq pay"** Figma file
(`cwnqBlkk2fS7vWNqn3xgEm`) — 21 screens, each specified in light *and* dark,
plus 25 loading/empty/error/wallet-gated/payment state frames and a component
sheet. Frames are 390 × 844.

### Tokens

All tokens live in `src/index.css` under `@theme` (light) and `.dark` (dark).
Components use token classes only — never raw hex.

| Purpose | Token | Light | Dark |
|---|---|---|---|
| Canvas | `bg-canvas` | `#f3f3f1` | `#0b0b0c` |
| Card | `bg-surface-raised` | `#ffffff` | `#141417` |
| Border | `border-line` / `border-line-strong` | `#ebebeb` / `#e0e0e0` | `#2a2a2f` / `#3a3a41` |
| Text | `text-ink` / `-soft` / `-muted` / `-faint` | `#0f0f0f` → `#767676` | `#f4f4f5` → `#8a8a92` |
| Brand text | `text-brand` | `#2e6bff` | `#4c82ff` |
| Brand fill | `bg-brand-fill` | `#2e6bff` | `#2e6bff` |
| Success / Warning / Danger | `*-bg` + text | `#dcfce7`/`#15803d`, `#fef3c7`/`#b45309`, `#fee2e2`/`#b91c1c` | dark equivalents |
| Polygon | `text-polygon` | `#8247e5` | `#8247e5` |

Type is **Inter** throughout: 28/800 display, 22/700, 20/800, 17/700, 15/700
button, 14/400 body, 11/600 label, 10/800 micro. Radii: `rounded-2xl` (16px)
for cards/sheets/inputs, `rounded-xl` (12px) for buttons and inner tiles,
`rounded-full` for pills and badges.

### Components

| Component | Notes |
|---|---|
| `ui/Button` | `primary` = solid brand blue with a blue glow; `secondary` = bordered surface; `ghost` = brand text; `danger` = **soft** (`bg-danger-bg` + `text-danger`); plus `accent` and `warning` |
| `ui/StatusPill` | tones `neutral/success/warning/danger/accent`, with a `solid` variant (the PARKPILOT PICK badge) |
| `ui/Toggle` | 44 × 24, ON is brand blue, white knob in both themes |
| `ui/EmptyState` | dashed border, icon medallion, optional danger tone |
| `ui/StateCard` | terminal-state card for error / success / gated presentations |
| `parking/ParkingCard` | horizontal: 76px photo, badge row, title, `★ rating`, `Distance:` + price pill. `compact` is the vertical variant |
| `wallet/WalletPill` | connected (Nimiq mark + address + Polygon badge + status dot), connecting (skeleton), or CONNECT WALLET |
| `wallet/ChainBadge`, `wallet/ConnectWalletPrompt` | Polygon badge; full-screen wallet gate |
| `brand/NimiqMark`, `brand/UsdtMark` | inline SVG marks, no network request |

### Rules

- **No fabricated data.** Ratings come from the `reviews` table via the
  `nearby_parking_spaces` RPC (migration `0017`); a listing with no reviews shows
  its address rather than a `0.0` rating.
- **Google Maps attribution is never covered, hidden or restyled.**
- Every screen supports light **and** dark; only the light state frames exist, so
  dark states derive from the tokens.

---

## Technology stack

- **Frontend**: Vite, React 19, TypeScript, Tailwind CSS v4, React Router
- **Chain**: viem, `@nimiq/mini-app-sdk`
- **Map & routing**: Google Maps JavaScript API + Routes API
- **Backend**: Supabase (Postgres, Row Level Security, Edge Functions)
- **Icons**: Lucide

---

## Local development

Requirements: **Node.js 22+**, npm, and Nimiq Pay on a phone on the same Wi-Fi.

```bash
npm install
npm run dev
```

The dev server binds to all interfaces on port **5173**.

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Typecheck + production build |
| `npm run preview` | Preview the production build |
| `npm run typecheck` | TypeScript only |
| `npm run lint` | ESLint |

---

## Environment variables

Copy `.env.example` to `.env`:

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_PLATFORM_PAYMENT_ADDRESS=
VITE_POLYGON_CHAIN_ID=0x89
VITE_POLYGON_CHAIN_ID_DECIMAL=137
VITE_POLYGON_RPC_URL=https://polygon-bor-rpc.publicnode.com
VITE_USDT_CONTRACT_ADDRESS=0xc2132D05D31c914a87C6611C10748AEb04B58e8F
VITE_USDT_DECIMALS=6
VITE_BLOCK_EXPLORER_URL=https://polygonscan.com
VITE_APP_MODE=production
VITE_GOOGLE_MAPS_API_KEY=
VITE_GOOGLE_MAPS_TRACKING_ID=
```

Only `VITE_*` values reach the browser. **Never** put the Supabase service-role
key or any private key here.

### Google Maps

`VITE_GOOGLE_MAPS_API_KEY` is a **browser** key, so it ships in the client bundle
by design — protect it with an **HTTP-referrer restriction** in Google Cloud
(enable *Maps JavaScript API* and link billing; the Dynamic Maps SKU includes
10,000 free map loads per month). Allow every origin you serve from, e.g.:

```
http://localhost:5173/*
http://<your-lan-ip>:5173/*
https://<your-domain>/*
```

**Also enable the Routes API on the same project.** It powers in-app drive/walk
routing and traffic-aware ETAs. The app degrades in layers if it is missing:

| Layer | Requires | What you get |
| --- | --- | --- |
| Routes API `computeRoutes` | Routes API enabled | Traffic-aware durations, real walking routes, turn-by-turn instructions |
| `DirectionsService` | Directions API (JS API) | Routed geometry, traffic-aware driving, simpler steps |
| Straight-line estimate | nothing | A distance and time clearly labelled `~` / "estimated" |

Nothing is ever presented as an exact route when it is only an estimate.

The map is **Google Maps only** — the Maps JavaScript API.
`VITE_GOOGLE_MAPS_API_KEY` is **required**; without it the map renders a "Map
unavailable" placeholder instead of crashing. The key must be allowed for every
origin you serve from (the phone sends the LAN origin in dev), and the API needs
billing enabled.

`VITE_GOOGLE_MAPS_MAP_ID` is optional. Setting a **Vector** Map ID (JavaScript,
and **Tilt and Rotation** checked) switches the map to vector rendering, which
is the only way to enable camera rotation. It must live in the same Google Cloud
project as the API key. Without one the map is raster, rotation is skipped
rather than faked, and heading is shown with the position arrow instead. A Map
ID also moves styling into Google Cloud — inline `styles` are ignored once it is
set, so the theme is applied through `colorScheme`.

The Map ID can also be supplied at runtime — `localStorage['parkpilot.map_id']`
or `window.__PARKPILOT_MAP_ID__` — which beats the env var. A Map ID is not a
secret, so this makes it trivial to switch rotation on, or roll it back, without
a rebuild.

**Rotation availability is read from the map, not assumed.** A Map ID being
present does not mean the vector renderer engaged: a Map ID created as Raster,
one from a project the key cannot see, or a browser without usable WebGL all
leave the map on the raster renderer, where `setHeading` is silently ignored.
`GoogleMap.tsx` therefore polls `getRenderingType()` and only claims vector once
the map reports `VECTOR`. It also passes `renderingType: 'VECTOR'` explicitly,
which overrides whatever the Map ID was configured with.

**The camera runs on a frame loop, not on GPS fixes.** Fixes arrive roughly once
a second while the screen redraws at 60fps, so applying each one directly makes
the map jump every second. Each fix is stored as a *target* and the loop eases
the camera toward it, applying centre, heading and zoom in a single
`moveCamera` call so they land in the same frame instead of animating
separately. The easing maths is pure and tested in `src/lib/maps/camera.ts`.

Other things handled here:

- Google does not support changing the Map ID after construction, and re-sending
  it resets the camera. Appearance options are therefore split —
  `mapInitOptions` (construction, includes `mapId`) and `mapThemeOptions`
  (re-theming, never includes it).
- `fitBounds` resets the heading to zero, so the framing effect is skipped
  entirely while following; the camera loop owns the map instead.
- **Two-finger rotate is enabled.** While following, the camera owns the
  heading, but a rotation the driver performs themselves is detected (via a
  `heading_changed` that fires outside our own `moveCamera`) and treated as
  taking manual control, so the camera lets go instead of snapping back. The
  screen's "Resume following" control hands it back.
- The position marker is a fixed up-arrow on a vector map, because the map
  itself now conveys heading — rotating it too would point it the wrong way. On
  raster it still rotates.
- Tilt is deliberately left at 0.
- Marker icons are cached by their inputs. Rebuilding one allocates an SVG data
  URL that the browser must decode, which is what made the map stutter while
  moving.

An invalid or deleted Map ID falls back to the raster renderer rather than
leaving the driver with a dead map.

`VITE_DEBUG_MAP=true` exposes `window.__PARKPILOT_MAP__`,
`__PARKPILOT_ROTATION__` and `__PARKPILOT_RENDERING__` so camera state can be
asserted from automated checks. It is gated off by default and verified absent
from production builds.

**Known verification limit:** headless Chrome cannot initialise the vector
renderer — Google logs *"Attempted to load a Vector Map, but failed. Falling
back to Raster."* even with software WebGL available. That message does confirm
vector rendering was *requested*, but rotation itself can only be confirmed on a
real GPU, so it must be checked on a device.

Google's required attribution (the logo and "Map data ©…") is never hidden,
covered or altered. App UI on the navigation screen deliberately stops short of
the bottom edge so the attribution strip stays clear, and there is a pixel check
for this in the browser verification harness.

Live location uses `navigator.geolocation`, which browsers only expose on a
**secure context** — so it works on `https://` and `localhost`, but not over
plain `http://` on a LAN IP. Over LAN the map still works; the location dot and
"Near you" ranking need an HTTPS origin (deploy, or a tunnel).

`VITE_GOOGLE_MAPS_TRACKING_ID` is optional (Google's `channel` param for usage
reporting).

### Edge Function secrets

Set these server-side (they are never exposed to the client):

```bash
supabase secrets set \
  POLYGON_RPC_URL=https://polygon-bor-rpc.publicnode.com \
  USDT_CONTRACT_ADDRESS=0xc2132D05D31c914a87C6611C10748AEb04B58e8F \
  POLYGON_CHAIN_ID=137 \
  BLOCK_EXPLORER_URL=https://polygonscan.com \
  ALLOWED_ORIGINS=https://your-app.example \
  AUTH_SECRET=<a-long-random-string>
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically to
Edge Functions by Supabase.

---

## Supabase setup

```bash
supabase link --project-ref <your-project-ref>
supabase db push
supabase functions deploy \
  create-reservation verify-usdt-payment get-reservation list-reservations \
  cancel-reservation create-parking-space update-parking-space \
  delete-parking-space list-host-spaces list-host-bookings host-earnings \
  set-availability wallet-challenge verify-wallet-signature
```

Migrations in `supabase/migrations/`:

- `0001_schema.sql` — tables, enums, indexes, triggers, and an overlap
  exclusion constraint that prevents double-booking.
- `0002_rls.sql` — public read-only catalogue, insert-only analytics, and
  deny-by-default for reservations/payments/identities.
- `0003_seed.sql` — eight demo Toronto parking listings.

---

## Nimiq Pay testing

1. Start the dev server and note the **Network URL** (e.g.
   `http://192.168.1.42:5173`).
2. Open **Nimiq Pay → Mini Apps → Custom URL** and enter it.
3. The phone and dev machine must be on the same Wi-Fi network.

`localhost` from inside the WebView resolves to the phone, so always use the
LAN IP.

---

## Security

- No private keys or seed phrases anywhere in the repository.
- The frontend uses **only** the Supabase anon key.
- Row Level Security enabled on every table; reservations and payments are
  written exclusively by Edge Functions using the service role.
- All EVM addresses are validated with viem before encoding.
- Chain, token contract, sender, recipient, and amount are verified on-chain.
- Transaction hashes are unique — no duplicate reservations or double counting.
- Double-booking is prevented by a Postgres **exclusion constraint**, and
  abandoned unpaid reservations expire after 15 minutes.
- The client is never trusted for price, recipient, or amount — the backend
  re-derives them from the database before confirming a payment.
- User rejection is handled gracefully and never crashes the app.
- Minimal data collection, with a clear privacy notice.

---

## Deployment

The app is a static SPA. SPA fallback is already configured for common hosts:

- **Vercel** — `vercel.json` rewrites all routes to `index.html`.
- **Netlify / Cloudflare Pages** — `public/_redirects`.

Deploy the `dist/` output from `npm run build`, and point `ALLOWED_ORIGINS` at
the deployed origin.

---

## Hackathon submission

- **Product**: ParkPilot — find parking, pay with USDT through Nimiq Pay.
- **Category**: Nimiq Pay Mini App.
- **Network**: Polygon mainnet.
- **License**: MIT.
- **Demo flow**: connect → search → reserve → pay → verified → parking pass.

See [`SUBMISSION.md`](./SUBMISSION.md) for the written description.

---

## License

MIT — see [`LICENSE`](./LICENSE).
