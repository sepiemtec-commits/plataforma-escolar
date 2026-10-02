# AGENTS.md

## Cursor Cloud specific instructions

This is a single Node.js/Express app ("Plataforma Escolar", a school management system).
The Express backend also serves the static frontend, so there is only one app process.
Standard commands live in `package.json` `scripts`; see `README.md`/`SETUP.md` for details.

### Services

- **MongoDB** (required): backend exits immediately if it cannot connect. The committed
  `docker-compose.yml` expects Docker, but Docker is not available on the Cloud VM. Instead
  MongoDB is installed natively (`mongodb-org` 8.0). Start it (not part of the update script) with:
  `sudo mongod --dbpath /var/lib/mongodb --bind_ip 127.0.0.1 --port 27017`
  (run in the background, e.g. via tmux). Do NOT use `npm run db:up` / `npm run setup` here
  since those call `docker-compose`.
- **App server** (required): `npm run dev` (nodemon) serves API at `/api/*` and the frontend at
  `/` on `PORT` (default `3000`). Health check: `GET /health`.

### Environment / gotchas

- A `.env` file at the repo root is required (`.env` is gitignored). Copy `.env.example` and set
  at least `MONGODB_URI` and `JWT_SECRET`. `dotenv` loads `.env` from the process CWD (repo root),
  so run `npm run dev`/`npm run seed` from the repo root — not from `backend/` as some docs suggest.
- Twilio/WhatsApp is optional: leave `TWILIO_*` blank and it no-ops.
- Seed data: `npm run seed` (idempotent) creates the test school + users. All test users use
  password `senha123` (e.g. `diretor@escola.com`, `professor@escola.com`, `aluno1@escola.com`).
  The login API expects JSON `{ "email", "senha" }`.

### Lint / test / build

- No lint config and no build step (frontend is static, backend runs Node directly).
- `npm test` runs `jest`, but there are currently no test files, so it reports "No tests found".
