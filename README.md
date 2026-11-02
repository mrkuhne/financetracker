# Finance Tracker

A personal finance PWA: accounts, transactions, recurring income and bills, and a weekly/monthly
spending allowance (with month-end close to Savings). All amounts are tracked in their account's
currency and valued in HUF.

## Stack

- [Base44](https://base44.com) backend (entities, auth, hosting)
- Vite + React 18 + TypeScript (strict) + Tailwind CSS, installable as a PWA
- Vitest for the pure domain logic (`src/domain`) and feature models

Layout: `src/domain` (pure, tested money/date/allowance logic), `src/data` (Base44 data access),
`src/features` (screens), `src/app` (startup and recurring materialization), `base44/` (entity schemas).

## Getting started

```bash
npm install
base44 login
base44 link    # fresh clone only: base44/.app.jsonc is gitignored
base44 dev     # local dev server
```

## Commands

| Command | What it does |
|---------|--------------|
| `npm test` | Run the unit tests |
| `npm run build` | Type-check and build |
| `npm run deploy` | Build with the Base44 app id injected and deploy (plain `npm run build` output has no app id, so login loops in production) |

## Docs

- Design spec: [docs/superpowers/specs](docs/superpowers/specs)
- Implementation plans: [docs/superpowers/plans](docs/superpowers/plans)
- Visual prototype: [docs/prototype](docs/prototype)
