# Finance Tracker

## Git workflow

- Work directly on `main`: commit and push to `origin/main` without asking. No feature branches or PRs unless the user asks for one.
- Run `npm test` before pushing.

## Deploy

- Deploy with `npm run deploy` (`base44 deploy --yes --build`). A plain `npm run build` bundle has no Base44 app id, so production login loops.
