# ShiftFlow

Automated shift dashboard that ingests weekly schedule PDFs from Gmail and displays your personal shifts in a clean mobile-first UI.

## Architecture

| Component | Tech | Deploy |
|-----------|------|--------|
| Frontend | Next.js 15, Tailwind, shadcn/ui | Vercel |
| Backend API | Express + TypeScript | Railway (Docker) |
| Database + Auth + Storage | Supabase | Managed |
| PDF Parsing | pdf-parse + Claude AI (Anthropic) | Inside backend |
| Email Notifications | Gmail API + Google Cloud Pub/Sub | Push-based |

## Quick Start (Local Development)

### Prerequisites

- Node.js 20+
- pnpm 9+
- A Supabase project (free tier works)
- Google Cloud project with Gmail API enabled
- Anthropic API key

### 1. Clone and install

```bash
cd shiftflow
pnpm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your actual values. Then create `apps/web/.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_API_URL=http://localhost:3001
```

### 3. Set up Supabase

Run the SQL migrations in order against your Supabase project:

```bash
# Using Supabase CLI
supabase db push

# Or manually via Supabase Dashboard → SQL Editor:
# Run each file in supabase/migrations/ in order
```

### 4. Run the apps

```bash
# Terminal 1: Backend
pnpm --filter @shiftflow/api dev

# Terminal 2: Frontend
cd apps/web && pnpm dev
```

Frontend: http://localhost:3000
Backend: http://localhost:3001

## Google Cloud Setup

### Gmail API

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing)
3. Enable the **Gmail API**
4. Go to **Credentials** → Create **OAuth 2.0 Client ID**
   - Application type: Web application
   - Authorized redirect URIs: `http://localhost:3000/api/gmail/callback-redirect`
   - For production: `https://your-domain.vercel.app/api/gmail/callback-redirect`
5. Copy Client ID and Client Secret to your `.env`

### Cloud Pub/Sub

1. Go to **Pub/Sub** → Create Topic
   - Name: `gmail-push`
2. Create a Subscription on that topic:
   - Type: **Push**
   - Endpoint: `https://your-api-domain.up.railway.app/gmail/webhook?token=YOUR_VERIFY_TOKEN`
   - For local dev, use a tunnel (ngrok) as the push endpoint
3. Grant Gmail publish permission:
   ```bash
   gcloud pubsub topics add-iam-policy-binding gmail-push \
     --member="serviceAccount:gmail-api-push@system.gserviceaccount.com" \
     --role="roles/pubsub.publisher"
   ```

## Deploy to Production

### Backend → Railway

1. Push code to GitHub
2. Go to [Railway](https://railway.com/) → New Project → Deploy from GitHub repo
3. Set the **Dockerfile path**: `apps/api/Dockerfile`
4. Set the **Root directory**: `/` (monorepo root)
5. Add all environment variables from `.env` (backend section)
6. Railway will build and deploy automatically

### Frontend → Vercel

1. Import repo on [Vercel](https://vercel.com/)
2. Set **Root Directory**: `apps/web`
3. Framework Preset: Next.js
4. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_API_URL` → your Railway backend URL

### Post-deploy

1. Update Google OAuth redirect URI to production frontend URL
2. Update Pub/Sub push subscription endpoint to production backend URL
3. Update `FRONTEND_URL` env var in Railway to production frontend URL

## Project Structure

```
shiftflow/
├── apps/
│   ├── web/          # Next.js frontend (Vercel)
│   └── api/          # Express backend (Railway Docker)
├── supabase/
│   └── migrations/   # SQL schema migrations
├── turbo.json
└── pnpm-workspace.yaml
```

## How It Works

1. User signs up and sets their **employer email** (the address that sends schedule PDFs)
2. User clicks **Connect Gmail** → OAuth2 consent → backend stores tokens + sets up Gmail watch
3. When employer sends a new schedule email, Gmail notifies the backend via Pub/Sub webhook
4. Backend downloads the PDF, hashes it for dedup, uploads to Supabase Storage
5. `pdf-parse` extracts raw text → Claude AI extracts structured shift data for the user
6. Shifts are upserted into the database
7. Frontend displays them on the dashboard and schedule pages
