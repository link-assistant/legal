# SatyaVera

**AI Legal Assistant for India** — Know Your Rights. Protect Your Future.

An AI-powered legal assistant that explains your rights in plain Hindi and English with cited law sections and case references.

## Features

- **GandhiAI Chat** — Conversational legal Q&A with cited BNS/BNSS/BSA sections
- **846 Indian Central Acts** — Full text of 34,853 sections, browsable by category
- **Document Drafter** — FIR, RTI, bail applications, notices in proper legal format
- **Rights Guides** — Step-by-step playbooks for common legal situations
- **Lawyer Marketplace** — Find bar-council-verified advocates near you
- **Legal Dictionary** — 4,200+ terms in English and Hindi
- **Emergency SOS** — Helpline numbers and instant rights during arrest/detention
- **Bilingual** — Full English and Hindi support with JSON-based i18n

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16.2.6 (App Router), TypeScript, Tailwind CSS v4 |
| API | Rust Axum server (`rust/api`) owns every `/api/*` endpoint |
| Auth | Firebase Authentication (Email, Google, Phone OTP) + Rust ID-token verification |
| Database | Rust in-process store with optional journal; Firestore seed/import scripts |
| AI | Rust legal-information fallback behind the chat/document API |
| i18n | JSON-based (en/hi) with language dropdown |
| Laws Data | 846 acts from [indian-law](https://github.com/Svetozar-Technologies/indian-law) repo |

## Documentation

- [`docs/`](./docs/README.md) — documentation index.
- [`docs/architecture.md`](./docs/architecture.md) — full system architecture (frontend, API, Rust storage, CI/CD, deployment).
- [`docs/features.md`](./docs/features.md) — catalog of every shipped feature (user-facing, advocate-facing, developer-facing).
- [`docs/case-studies/issue-3/`](./docs/case-studies/issue-3/README.md) — case study for the repo refactor.

## Project Structure

All JavaScript / Next.js code lives under [`./js/`](./js/README.md); all Rust
code lives under `./rust/`. See [issue #3](https://github.com/Svetozar-Technologies/SatyaVera/issues/3)
and [`docs/case-studies/issue-3/`](./docs/case-studies/issue-3/README.md).

```
js/                       # Next.js project root (web + SPA basis)
  package.json
  next.config.ts          # STATIC_EXPORT / BASE_PATH gates
  apphosting.yaml         # Firebase App Hosting backend config
  src/
    app/                  # Next.js App Router pages
      (public)/           # Landing, login, signup, pricing
      (dashboard)/        # Auth-guarded citizen & lawyer dashboards
      app/                # /app SPA shell (universal-app basis)
    components/
      ui/                 # Button, Card, Chip, Icon, Field, etc.
      layout/             # PublicNav, AppNav, Sidebar, Footer
    lib/
      api/                # Browser fetch helper for the Rust API base URL
      firebase/           # client config, auth, firestore helpers
      i18n/               # Context + translation JSONs (en, hi)
    contexts/             # AuthProvider
    types/                # TypeScript interfaces
  scripts/
    ingest-laws.ts        # Parse .lino files → Firestore (846 acts)
    parse-lino.ts         # Links Notation parser
    law-categories.ts     # Auto-categorization (13 categories)
    build-static-export.mjs  # Build helper for GitHub Pages target
  data/laws/              # JSON snapshots used by the ingestion scripts
rust/                     # Cargo workspace
  api/                    # Axum HTTP API server for /api/*
  db/                     # satyavera-db crate (TransactionalStore + journal)
docs/case-studies/issue-3/  # Deep-dive analysis for the issue
.github/workflows/
  js.yml                  # JavaScript CI + GitHub Pages publish
  rust.yml                # Rust lint + cross-OS test matrix
  links.yml               # lychee link checker
```

## Getting Started

```bash
# All JavaScript commands run from ./js/
cd js
npm install

# Set up environment
cp .env.example .env
# Edit .env with Firebase client config and the Rust API base URL

# Terminal 1: run the Rust API locally
cd ../rust
SATYAVERA_API_AUTH_DISABLED=1 cargo run -p satyavera-api

# Terminal 2: run the Next.js frontend
cd ../js
NEXT_PUBLIC_API_BASE=http://127.0.0.1:8787 npm run dev
```

Open http://localhost:3000

### GitHub Pages target (universal-app SPA shell)

```bash
cd js
BASE_PATH="/SatyaVera" NEXT_PUBLIC_BASE_PATH="/SatyaVera" \
  npm run build:pages
```

This produces `js/out/`. CI publishes it automatically on push to `main` —
see `.github/workflows/js.yml`.

### Firebase App Hosting

`js/apphosting.yaml` drives the App Hosting backend. **Reminder**: after
this migration the backend's *Root directory* setting (Firebase console →
App Hosting → backend → Settings) must be set to `js`. Configure
`NEXT_PUBLIC_API_BASE` or `NEXT_PUBLIC_API_BASE_URL` to point at the
deployed Rust API.

## Indian Laws Database

The app includes 846 Indian Central Acts with full section text, sourced from [India Code](https://www.indiacode.nic.in/) via the [indian-law](https://github.com/Svetozar-Technologies/indian-law) repository.

```bash
# Clone the laws repo (next to this repo)
git clone https://github.com/Svetozar-Technologies/indian-law.git

cd js  # all npm scripts run from the Next.js project root

# Ingest all laws into Firestore
npm run ingest-laws -- --repo-path ../../indian-law

# Dry run (parse only, no Firestore writes)
npm run ingest-laws:dry

# Test with 5 laws
npm run ingest-laws:test

# Re-ingest (update existing)
npm run ingest-laws -- --repo-path ../../indian-law --force
```

Laws are auto-categorized into: Criminal, Civil, Constitutional, Property, Family, Labour, Consumer, Women, Corporate, Tax, Environment, Cyber, General.

## Environment Variables

See `.env.example` for all required variables:
- `NEXT_PUBLIC_FIREBASE_*` — Firebase client config
- `NEXT_PUBLIC_API_BASE` / `NEXT_PUBLIC_API_BASE_URL` — browser-visible Rust API origin
- `FIREBASE_PROJECT_ID` — Firebase project used by the Rust token verifier
- `FIREBASE_ADMIN_*` — Firestore/Auth access for Node seed and ingestion scripts
- `SATYAVERA_API_AUTH_DISABLED=1` — local-only Rust API auth bypass
- `SATYAVERA_API_JOURNAL_PATH` — optional append-only API mutation journal
- `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET`

## Firestore Collections

| Collection | Documents | Purpose |
|------------|-----------|---------|
| `laws` | 846 | Indian Central Acts metadata |
| `laws/{slug}/sections` | 34,853 | Full section text |
| `users` | per user | Profiles (citizen/advocate) |
| `conversations` | per user | GandhiAI chat history |
| `documents` | per user | Drafted legal documents |
| `subscriptions` | per user | Plan + daily query tracking |
| `guides` | admin-seeded | Rights situation guides |
| `templates` | admin-seeded | Legal document templates |
| `dictionaryEntries` | admin-seeded | Legal terms bilingual |
| `lawyerProfiles` | per advocate | Marketplace listings |

## Legal

This application provides legal **information**, not legal **advice**. Users should consult a qualified advocate for specific legal matters. Law text is sourced from official public sources ([India Code](https://www.indiacode.nic.in/)).
