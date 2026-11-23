# BotSphere AI

Multi-tenant WhatsApp AI automation: a real-time Unified Inbox with human takeover, a built-in mini-CRM, and an AI agent
that answers text **and voice notes**. WhatsApp connects by QR code through Evolution API, so no Meta verification is needed.

**Stack:** Next.js 15 (App Router, TypeScript) · Tailwind CSS v4 · Supabase (Postgres, Auth, Realtime, Storage, RLS) ·
Evolution API v2 (Docker) · OpenRouter · OpenAI Whisper/TTS or Deepgram/ElevenLabs · Recharts.

## Screens

| Route | What it does |
| --- | --- |
| `/` | Overview: KPIs, 7-day AI-vs-human chart, "Needs human" feed, recent leads |
| `/inbox` | 3-column real-time inbox, per-chat AI toggle, voice-note waveform player and transcripts, `/` quick replies, "Draft with AI" |
| `/crm` | Contacts table (search, filter, CSV export) and drag-and-drop Kanban pipeline |
| `/agent-studio` | Prompt, tone and model; Knowledge Base (PDF/TXT/URL/text); voice notes; handover rules; follow-ups; media library; live test chat |
| `/connect` | WhatsApp QR linking, live status, restart and disconnect |
| `/settings` | Workspace, office hours and after-hours mode, owner alert number, quick replies, team |

## Run it on your PC

**You need:** Node.js 20+ and Docker Desktop. On Windows, Docker Desktop needs WSL 2; 8 GB RAM is enough.

```bash
git clone https://github.com/Joshuaayomide35/botsphere-ai && cd botsphere-ai
npm install

# 1) WhatsApp engine (Evolution API + Postgres + Redis)
cd docker
cp .env.example .env            # change AUTHENTICATION_API_KEY and POSTGRES_PASSWORD
docker compose up -d
cd ..

# 2) App
cp .env.example .env.local      # set EVOLUTION_API_KEY to the same value as AUTHENTICATION_API_KEY
npm run dev                     # http://localhost:3000
```

Sign in, open **WhatsApp Connect**, click **Generate QR code**, and scan it from WhatsApp → *Linked devices*.
Add `OPENROUTER_API_KEY` (plus `OPENAI_API_KEY` for voice notes) to `.env.local` to turn the AI on.

### Environment variables (`.env.local`)

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project (publishable key only; no service-role key is used) |
| `EVOLUTION_API_URL`, `EVOLUTION_API_KEY` | Evolution API base URL and its `AUTHENTICATION_API_KEY` |
| `WEBHOOK_BASE_URL` | The URL Evolution uses to call this app. Use `http://host.docker.internal:3000` when both run on your PC, or your public https URL when deployed |
| `OPENROUTER_API_KEY` | AI replies, sandbox and co-pilot |
| `OPENAI_API_KEY` | Whisper speech-to-text and TTS voice notes |
| `DEEPGRAM_API_KEY`, `ELEVENLABS_API_KEY` | Optional alternative STT and TTS providers |

## How it works

```
WhatsApp ⇄ Evolution API (Docker) ──webhook──▶ /api/webhooks/evolution ──RPC──▶ Supabase (RLS)
                                                         │                         │ Realtime
                                                         ▼                         ▼
                                          AI pipeline (after())              Inbox / CRM UI
                              transcribe → context → OpenRouter → typing/recording presence → send
```

- **Channel adapter.** `src/lib/adapters/evolution.ts` maps Evolution payloads onto one internal `InboundMessage` shape.
  It handles `@lid` addressing, ignores groups and broadcasts, and supports text, voice, image and caption messages.
  New channels plug in the same way.
- **No service-role key.** Webhooks and cron call `SECURITY DEFINER` RPCs (`wa_webhook_message`, `wa_ai_context`,
  `wa_ai_record`, …) that verify a per-channel webhook secret. Users only ever touch data through RLS.
- **Human takeover.** Sending from the Inbox, or replying from the linked phone, sets `ai_enabled = false` for that chat.
  An echo guard (`wa_ai_claim_send`) keeps the AI's own sends from counting as a human reply.
- **Handover.** When the model flags a rule, the chat becomes `needs_human`, the AI pauses, and the owner gets a WhatsApp alert.
- **Follow-ups.** `pg_cron` runs `bs_cron_tick()` every minute. When follow-ups are due it POSTs to `/api/cron/follow-ups`
  using the Vault secrets `botsphere_app_url` and `botsphere_cron_secret`. Set `botsphere_app_url` to your deployed URL.

## Database

All migrations live in `supabase/migrations` and are already applied to the `ops-assistant-demo` project.
Every table carries a `workspace_id` that RLS enforces through `is_workspace_member` and `has_workspace_role`.

## Deploying

- **App:** Vercel or any Node host. Set the env vars above, and set `WEBHOOK_BASE_URL` to the public URL.
- **Evolution API:** a small always-on VPS, Railway or Render running `docker/docker-compose.yml`. Your PC is fine for
  development, but the bot only answers while the PC is on.
- If the app and Evolution run on different machines, the app's `/api/webhooks/evolution` must be reachable over the internet.

## Roadmap

Phases 1–5 are built. Phase 6 (Retell AI 1-tap web calls sharing the WhatsApp `conversation_id` memory) is parked;
the `calls` table and `call_summary` message type are already in the schema.
