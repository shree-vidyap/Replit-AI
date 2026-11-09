# AI Builder — Replit-like AI development platform

Everything from the PDF roadmap (Phases 1–5). First release: **describe a React application, edit the generated files in the browser, run it instantly, and deploy it.**

## Run it (Windows PowerShell, inside this folder)
```powershell
docker compose up -d                  # Postgres, Redis, MinIO (S3), Prometheus
copy .env.example .env                # then edit .env (see below)
npm install
npm run db:migrate                    # creates the tables
npm run dev                           # terminal 1: web app  -> http://localhost:3000
npm run worker                        # terminal 2: deploy / sandbox / mobile jobs
```
Edit `.env`:
- `ANTHROPIC_API_KEY` — from platform.claude.com → Settings → API keys
- `AUTH_SECRET` — any long random string. Generate one: `[Convert]::ToBase64String((1..32 | % { Get-Random -Max 256 }))`
- `ENCRYPTION_KEY` — any long random string (encrypts env vars and tokens)

Use **Chrome or Edge** (WebContainers). Do not close Docker Desktop while using the app.

## What is in it, by PDF phase
| Phase | Feature | Where |
|---|---|---|
| 1 | Monaco editor, file tree, templates, AI chat, live preview, terminal | `components/`, `lib/sandbox.ts` |
| 2 | Login / register (Auth.js) | `auth.ts`, `app/login`, `middleware.ts` |
| 2 | PostgreSQL + Prisma, cloud save, version history | `prisma/schema.prisma`, `app/api/files` |
| 2 | S3-compatible storage (MinIO locally) | `lib/storage.ts`, `app/api/upload` |
| 2 | Project sharing (viewer / editor) | `app/api/share`, Project → Share |
| 2 | Usage limits per plan | `lib/usage.ts` |
| 2 | Web deployment (Docker build → S3 → `<slug>.localhost:3000`) | `worker/deploy.ts`, `app/sites` |
| 3 | Multi-file edits, diff + approval, build/test run, auto error fix | `ChatPanel`, `lib/ai-agent.ts` |
| 3 | File search, codebase summaries | `SearchPanel`, `app/api/summary` |
| 4 | Expo template, web preview, QR (Expo Go), Android/iOS cloud builds via EAS | `lib/templates.ts`, `worker/mobile.ts` |
| 5 | Worker queues (Redis + BullMQ) | `lib/queue.ts`, `worker/` |
| 5 | Docker sandboxes for Python / Java / Go / PHP (non-root, no network, CPU/RAM/time limits) | `lib/docker-sandbox.ts` |
| 5 | Container orchestration + autoscaling (Kubernetes) | `deploy/k8s/`, `Dockerfile*` |
| 5 | Billing (Stripe) | `app/api/billing`, `/billing` |
| 5 | Team collaboration (shared projects with roles) | Project → Share |
| 5 | GitHub integration (push project as a commit) | `lib/github.ts` |
| 5 | Custom domains (TXT verification + CNAME) | `app/api/domains` |
| 5 | Usage analytics | `/billing`, `app/api/usage` |
| Monitoring | Prometheus `/api/metrics`, Sentry, OpenTelemetry | `lib/metrics.ts`, `instrumentation.ts` |
| Security | Encrypted env vars, upload scanning, audit log, path/command allowlists, rate limits, auto-stop of long processes | `lib/crypto.ts`, `lib/scan.ts`, `lib/audit.ts` |

## Try each part
1. **Local workspace** (no login): `/workspace/local` → Run → AI chat. Pick Python/Java/Go/PHP from the template list to use the Docker sandbox (needs login + worker).
2. **Register** at `/login`, then `/dashboard` → create a project.
3. **Deploy**: open a React project → Project tab → Deploy. Open `http://<slug>.localhost:3000` (Chrome resolves `*.localhost`).
4. **Share**: Project → Share → invite a registered email as viewer/editor.
5. **Summarize codebase** button in the AI chat helps the AI on bigger projects.

## Optional services
- **Stripe**: set `STRIPE_SECRET_KEY`, `STRIPE_PRICE_PRO`, `STRIPE_WEBHOOK_SECRET`; forward webhooks to `/api/billing/webhook`. Without them the Billing buttons show a "not configured" message.
- **Mobile builds**: set `EXPO_TOKEN` (expo.dev → Access tokens). The first build links the project with `eas init`; Android/iOS builds are a Pro-plan feature. iOS builds require an Apple Developer account; EAS manages signing credentials (`eas credentials`) and release history is listed in Project → Mobile.
- **GitHub**: create a personal access token with `repo` scope and paste it in Project → GitHub.
- **Sentry / OpenTelemetry**: set `SENTRY_DSN` or `OTEL_ENABLED=true`. Prometheus UI: http://localhost:9090.

## Production notes
- `Dockerfile` (web) and `Dockerfile.worker` (needs Docker daemon access). Kubernetes manifests with autoscaling are in `deploy/k8s/`.
- The worker uses the host Docker daemon. For multi-tenant production, move builds/sandboxes to Kubernetes Jobs with gVisor/Kata.
- Deploy currently supports React (Vite) projects (static build). Real-time co-editing is not included (sharing is role-based).
