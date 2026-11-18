# Deploying Ground School

This guide covers deploying Ground School with Docker and PostgreSQL for production use.

## Prerequisites

- Docker and Docker Compose (v2.20+)
- A domain or server IP for your deployment
- Google Cloud Console access for OAuth setup

## Quick Start (Local Development)

```bash
# Start the development database
pnpm db:up

# Configure environment
cp .env.example .env.local
# Edit .env.local with your settings (see Configuration below)

# Run the development server
pnpm dev
```

## Production Deployment with Docker Compose

### 1. Clone and Configure

```bash
git clone <repository-url>
cd ground-school
cp .env.example .env.local
```

### 2. Configure Environment Variables

Edit `.env.local` with the following required settings:

#### Database (required)

```bash
# When using the bundled PostgreSQL (default):
# Set a strong password - letters and digits only
PERSISTENCE_POSTGRES_PASSWORD=your-secure-password-here

# Or use an external PostgreSQL database:
# DATABASE_URL=postgres://user:password@host:5432/ground_school
```

#### Access Control (required for production)

```bash
# Site-wide access password - share this with approved users
# Use a long random value (at least 16 characters)
ACCESS_CODE=your-long-random-access-code

# Admin emails - comma-separated, case-insensitive
# These users can approve curriculum and view learner analytics
ADMIN_EMAILS=admin@example.com,instructor@example.com
```

#### Google OAuth (required for user authentication)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Navigate to **APIs & Services → Credentials**
4. Click **Create Credentials → OAuth client ID**
5. Select **Web application**
6. Add authorized redirect URIs:
   - `http://localhost:3000/api/auth/google/callback` (development)
   - `https://your-domain.com/api/auth/google/callback` (production)
7. Set consent screen to **External** (or Internal for Workspace)

```bash
GOOGLE_OAUTH_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=your-client-secret
AUTH_SESSION_SECRET=$(openssl rand -hex 32)
AUTH_PUBLIC_ORIGIN=https://your-domain.com
```

**Note**: Users sign in with any Gmail account. There is no domain restriction. Access is controlled via the ACCESS_CODE (which you share with approved users) and admin privileges are granted via ADMIN_EMAILS.

#### LLM Provider (at least one required for content generation)

Configure at least one provider for course generation. Example with OpenAI:

```bash
OPENAI_API_KEY=sk-...
OPENAI_MODELS=gpt-4o,gpt-4o-mini
DEFAULT_MODEL=openai:gpt-4o
```

See `.env.example` for other providers (Anthropic, Google, DeepSeek, etc.).

### 3. Run with Docker Compose

```bash
# Build and start all services
docker compose up -d --build

# View logs
docker compose logs -f ground-school
```

The app will be available at `http://localhost:3000` by default (loopback only).

### 4. Expose to the Network

By default, Docker Compose publishes only to `127.0.0.1`. To expose to the network:

```bash
# In .env.local, set:
OPENMAIC_PUBLISH_ADDRESS=0.0.0.0
OPENMAIC_PORT=3000

# IMPORTANT: Always set ACCESS_CODE before exposing to a network
```

### 5. Database Migrations

The app automatically creates required tables on first start. No manual migration is needed.

## Access Control Model

Ground School uses a two-layer access control:

1. **ACCESS_CODE** (site password): Anyone who knows this code can access the application. Share it only with approved users. Users enter this code once and it's remembered for 7 days.

2. **Google OAuth + ADMIN_EMAILS**: Users sign in with their Gmail account. Those whose email is in `ADMIN_EMAILS` get admin privileges (curriculum approval, learner analytics).

**Security notes**:
- Without `ACCESS_CODE`, the site is open to anyone (server logs a warning)
- Use at least 16 random characters for `ACCESS_CODE`
- The access code gate applies to all API routes except health check and auth endpoints

## Production Checklist

- [ ] Set a strong `ACCESS_CODE` (16+ random characters)
- [ ] Set a strong `PERSISTENCE_POSTGRES_PASSWORD`
- [ ] Configure Google OAuth with production redirect URI
- [ ] Set `AUTH_PUBLIC_ORIGIN` to your production URL
- [ ] Configure at least one LLM provider
- [ ] Set `ADMIN_EMAILS` with admin user addresses
- [ ] Place behind a reverse proxy with TLS (nginx, Caddy, etc.)
- [ ] Back up the PostgreSQL data volume regularly

## Recommended Low-Cost Hosting Options

### Option 1: Railway.app
- Managed PostgreSQL included
- Simple Docker deployment
- ~$5-20/month depending on usage
- Auto-scaling and sleep on inactivity

```bash
# Install Railway CLI
npm install -g @railway/cli

# Deploy
railway login
railway init
railway up
```

### Option 2: Fly.io
- Generous free tier (3 shared VMs)
- Managed PostgreSQL add-on
- Global edge deployment

```bash
# Install Fly CLI
curl -L https://fly.io/install.sh | sh

# Deploy
fly launch
fly postgres create
fly deploy
```

### Option 3: DigitalOcean App Platform
- Managed PostgreSQL included
- $12/month basic tier
- Simple GitHub integration

### Option 4: Self-Hosted VPS
- Any VPS provider (DigitalOcean, Linode, Vultr, Hetzner)
- ~$5-10/month for a basic VPS
- Full control over infrastructure

```bash
# On your VPS:
apt update && apt install docker.io docker-compose-plugin
git clone <repository-url>
cd ground-school
cp .env.example .env.local
# Configure .env.local
docker compose up -d
```

## TLS/HTTPS Setup

For production, place Ground School behind a reverse proxy with TLS:

### Using Caddy (recommended for simplicity)

```bash
# Caddyfile
your-domain.com {
    reverse_proxy localhost:3000
}
```

Caddy automatically obtains and renews Let's Encrypt certificates.

### Using nginx + certbot

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;
    
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

When using a reverse proxy, set `TRUST_PROXY_HEADERS=true` in `.env.local` to enable rate limiting based on client IP.

## Data Persistence

Data is stored in two Docker volumes:
- `ground-school-postgres`: PostgreSQL database
- `ground-school-data`: Uploaded materials and generated assets

**Backup the PostgreSQL volume regularly:**

```bash
# Backup
docker exec ground-school-postgres-1 pg_dump -U ground_school ground_school > backup.sql

# Restore
docker exec -i ground-school-postgres-1 psql -U ground_school ground_school < backup.sql
```

## Troubleshooting

### "Access code required" on every request
- Check that `ACCESS_CODE` is set in `.env.local`
- Verify the cookie is being set (requires HTTPS in production, or set `COOKIE_SECURE=0` for HTTP)

### Google sign-in not working
- Verify all four Google OAuth variables are set
- Check redirect URI matches exactly in Google Console
- Ensure `AUTH_PUBLIC_ORIGIN` matches your deployment URL

### Database connection errors
- For bundled PostgreSQL: check `PERSISTENCE_POSTGRES_PASSWORD` uses only letters/digits
- For external PostgreSQL: verify `DATABASE_URL` format and connectivity

### Container startup issues
```bash
# Check logs
docker compose logs ground-school
docker compose logs postgres

# Restart services
docker compose restart
```

## Environment Variables Reference

See `.env.example` for the complete list of environment variables with descriptions.

Key variables for deployment:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes* | PostgreSQL connection string |
| `PERSISTENCE_POSTGRES_PASSWORD` | Yes* | Bundled PostgreSQL password |
| `ACCESS_CODE` | Recommended | Site access password |
| `ADMIN_EMAILS` | Recommended | Comma-separated admin emails |
| `GOOGLE_OAUTH_CLIENT_ID` | For OAuth | Google OAuth client ID |
| `GOOGLE_OAUTH_CLIENT_SECRET` | For OAuth | Google OAuth client secret |
| `AUTH_SESSION_SECRET` | For OAuth | Session signing secret |
| `AUTH_PUBLIC_ORIGIN` | For OAuth | Public URL of deployment |
| `DEFAULT_MODEL` | Yes | Default LLM model |
| `OPENAI_API_KEY` | Provider-dependent | OpenAI API key |

*Either `DATABASE_URL` (external) or `PERSISTENCE_POSTGRES_PASSWORD` (bundled) is required.
