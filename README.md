# odel-web

Web app for the ODeL platform: the student web (`/`) and staff web (`/staff/*`) on each university's address, and the provider console on the console address. One Next.js app (App Router, React Server Components, Tailwind CSS v4), run with Bun. The API is [odel-backend](../odel-backend) (Spring Boot); the B0 contract is `odel-backend/docs/api-b0.md`.

## Run it

There is no Node on the dev Mac; use Bun.

```bash
export PATH=$HOME/.bun/bin:$PATH
bun install

# Against the real API (odel-backend gateway on :9300, dev profile: scripts/dev/run-all.sh)
bun run dev                 # http://wesley.localhost:3000/staff

# Without the API: typed fixtures that follow the contract
bun run dev:mock            # ODEL_MOCK_API=1
```

Use `bun run dev`, not `bun --bun next dev`: under the Bun runtime the Next 16 dev server keeps sending Fast Refresh rebuilds and the page reloads in a loop. Production (`next start`) is fine under `--bun`.

### Dev hosts

`*.localhost` resolves to 127.0.0.1 in Chrome, Firefox and Playwright's Chromium; no hosts-file edits.

| Address | What you get |
|---|---|
| `http://wesley.localhost:3000/` | Wesley University: student home (opens-soon page in B0) |
| `http://wesley.localhost:3000/staff` | Wesley staff web (sign-in, setup checklist) |
| `http://crestfield.localhost:3000/staff` | Same app in Crestfield's colours (mock mode seeds it; with the real API, create it in the console first) |
| `http://console.localhost:3000/` | Provider console |
| `http://paused.localhost:3000/staff/sign-in` | Mock mode only: a suspended university |
| `http://wesley.localhost:3000/dev/states` | Dev-only gallery: student shell + shared states (404 in a real production build) |

The host decides the surface (`src/proxy.ts`): `console.*` serves the console, whose pages live under `/console/*` internally; every other host is a university.

### Environment

| Variable | Default | |
|---|---|---|
| `ODEL_API_URL` | `http://localhost:9300` | Where `/api/*` is forwarded (the api-gateway) |
| `ODEL_MOCK_API` | unset | `1` = mock mode. Never set in production |
| `ODEL_MOCK_SEED` | `demo` | Mock only: `demo` seeds Wesley and Crestfield, `empty` starts with no universities (SA-01 empty state) |

See `.env.example`.

## How it talks to the API

- The browser only talks to this host. `src/app/api/[...path]/route.ts` forwards `/api/*` to `ODEL_API_URL`, adds `X-Odel-Host` (the browser's host), and passes redirects (`redirect: "manual"`), bodies (including file PUTs to `/api/v1/dev/storage/**`) and every `Set-Cookie` through untouched, so session and CSRF cookies are first-party.
- Google sign-in is browser navigation to `/api/v1/auth/google/start?returnTo=…` through that proxy. The chain ends at `/auth/continue`, which reads `GET /session` and routes by stage.
- Server components read with `apiGet()` (`src/lib/api/server.ts`), forwarding the cookie and host. Every write goes from the browser through `api()` (`src/lib/api/client.ts`), which sends `X-XSRF-TOKEN` from the `XSRF-TOKEN` cookie.
- Branding: the root layout calls `GET /public/context` and writes the university's colours as CSS variables (`src/lib/brand.ts` derives the tints), so a new university needs no code change.

## Mock mode

`ODEL_MOCK_API=1` swaps the proxy and server reads for `src/lib/mock/handler.ts`, which answers the same paths, status codes and bodies as the contract (CSRF and idle timeout included). "Continue with university Google account" opens `/dev/mock-google`, where you pick who signs in:

- first ODeL admin (2FA setup → backup codes → empty checklist), returning admin (2FA code), admin with three roles (choose role, role switcher), lecturer/HOD/exam officer, platform admin (console);
- each with a "2-minute idle timeout" link to see S-01 quickly;
- every sign-in error: not linked, no role, wrong domain, suspended, cancelled, expired.

Codes: any 6 digits except `000000`; backup codes look like `4827-1930`.

B2 in mock mode: the student **Tunde Ajayi** (`WU/ODL/24/0166`, password `Password1`) starts unpaid; card payments open a stand-in checkout (Pay, Decline, Close); a transfer or USSD "I have…" is confirmed about 15 seconds later. Wesley's seed also has a paid and registered student, a confirming transfer, a paid-twice refund and a reversal. Set the registration window for the demo with `http://wesley.localhost:3000/api/v1/dev/mock-b2?window=NOT_OPEN|OPEN|LATE|CLOSED|NOT_SET`. The coordinator is the "Admin with three roles" persona (Akure).

## Checks

```bash
bun run lint
bun run typecheck
bun run build
bun run test                                   # Playwright, mock mode, against the build (port 3100)
SCREENSHOTS=1 bunx playwright test screenshots # review screenshots into ./screenshots (gitignored)

# End to end against the real API (gateway on :9300, dev profile, `bun run dev` on :3000):
bunx playwright test -c playwright.real.config.ts
# If the seeded people already have two-step sign-in, pass their secrets:
# ODEL_TOTP_CHUKA_OBI=… ODEL_TOTP_NGOZI_ADEBAYO=… bunx playwright test -c playwright.real.config.ts
```

## Layout

```
src/proxy.ts                    host → surface (console rewrite)
src/app/api/[...path]           same-origin API proxy (or mock)
src/app/(student)               student web: / and its sections
src/app/staff/sign-in/*         W-01 … W-06, S-02 (the console re-exports them)
src/app/staff/(app)/*           staff shell, setup checklist, coming-later pages
src/app/console/(app)/*         provider console
src/app/dev/*                   mock Google, state gallery (dev and mock only)
src/components/ui               design-system primitives (D0 library)
src/lib                         API clients, mock, brand maths, helpers
```

Icons are a subset of Material Symbols Rounded (`src/fonts`, ~9 KB). After using a new icon name, add it to `src/components/ui/icon-names.ts` and run `bun run icons`.

Routes, their Figma frames and status: [docs/routes.md](docs/routes.md).
