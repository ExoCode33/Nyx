# 🌙 Nyx

A Discord link watchdog bot with multi-layer threat detection, tiered enforcement, and an interactive admin panel.

Named after the Greek goddess of night — Nyx watches in the shadows, sees everything, and strikes when threats appear.

---

## Features

### 🔍 Multi-Layer Scanning
- **Redirect resolution** — follows t.co/bit.ly chains to scan the final destination
- **Google Safe Browsing** — checks both original and resolved URLs against Google's threat database
- **Domain age lookup** — flags domains registered less than 30 days ago (configurable)
- **Heuristic scoring** — pattern-based detection catches typosquats, suspicious TLDs, obfuscated paths, IP-based URLs, and more
- **Per-user rate limiting** — auto-flags users who post too many links too quickly

### ⚡ Tiered Enforcement
Links are automatically assigned to one of three tiers based on threat level:

| Tier | What happens |
|------|--------------|
| **WARN** 🟡 | Warning embed appears below the message (auto-deletes after 30s) |
| **QUARANTINE** 🟠 | Message deleted, spoiler-wrapped version posted, added to mod review queue |
| **DELETE** 🔴 | Message deleted immediately, user receives DM, admins are pinged in log channel |

### 🎛️ Interactive Admin Panel
One command (`/nyx admin`) opens an ephemeral interactive panel with:
- 🛡️ **Allowlist** — add/remove trusted domains
- 🚫 **Blocklist** — add/remove blocked domains
- 🔍 **Review Queue** — multi-select approve/deny quarantined links
- 📊 **User Reputation** — search and view any user's link statistics
- ⚙️ **Settings** — set log channel, configure which roles can access the panel

All interactions use buttons, dropdowns, and modals — no need to remember command syntax.

---

## Quick Start

### Prerequisites
- Node.js 20+
- PostgreSQL database (Railway provides this automatically)
- Discord bot token with `MessageContent` intent enabled ([Developer Portal](https://discord.com/developers/applications))
- Google Safe Browsing API key ([Google Cloud Console](https://console.cloud.google.com/))

### Deploy to Railway

1. **Fork or clone this repo**
2. **Create a new project on Railway** and connect your repo
3. **Add a PostgreSQL database** to your project
4. **Set environment variables** in Railway:
   ```
   DISCORD_TOKEN=your_discord_bot_token
   SAFE_BROWSING_API_KEY=your_google_api_key
   ```
   Railway automatically provides `DATABASE_URL`

5. **Create the schema** — connect to your Railway Postgres and run:
   ```bash
   psql $DATABASE_URL < src/db/schema.sql
   ```

6. **Deploy** — Railway auto-deploys on push

### Run Locally

```bash
# Install dependencies
npm install

# Copy .env.example to .env and fill in your values
cp .env.example .env

# Create database schema (make sure your DATABASE_URL is set in .env)
psql $DATABASE_URL < src/db/schema.sql

# Start the bot
npm start
```

---

## Configuration

All tunable values can be set via environment variables (see `.env.example`):

| Variable | Default | Description |
|----------|---------|-------------|
| `REDIRECT_TIMEOUT_MS` | 5000 | Max milliseconds to spend following redirect chains |
| `DOMAIN_AGE_DAYS` | 30 | Domains younger than this trigger YOUNG_DOMAIN signal |
| `HEURISTIC_WARN_THRESHOLD` | 40 | Heuristic score at or above this triggers at least WARN tier |
| `HEURISTIC_DELETE_THRESHOLD` | 70 | Heuristic score at or above this triggers DELETE tier |
| `RATE_LIMIT_MAX` | 3 | Max links one user can post in one window before being flagged |
| `RATE_WINDOW_MS` | 60000 | Sliding window length for rate limiter (milliseconds) |
| `WARN_TTL_MS` | 30000 | How long warning embeds stay before auto-delete (0 = forever) |

---

## Admin Panel Usage

Run `/nyx admin` (ephemeral — only you see it).

By default, only users with `Administrator` permission can access the panel. You can configure additional roles in **Settings → Set Admin Roles**.

### Allowlist
1. Click **Allowlist** button
2. **Add Domain** — opens a modal to enter domain + optional reason
3. **Remove Domain** — shows dropdown of current entries

### Blocklist
Same flow as Allowlist, but for blocked domains.

### Review Queue
Shows all quarantined links awaiting mod decision.
- **Accept Domains** — multi-select dropdown, approve multiple at once (re-posts them)
- **Deny Domains** — multi-select dropdown, delete multiple at once

### User Reputation
- Click **User Reputation**
- Use the search dropdown to find any server member
- View their total links, safety rate, and breakdown by tier

### Settings
- **Set Log Channel** — choose where security logs are posted (auto-creates `#nyx-logs` if none set)
- **Set Admin Roles** — choose which roles can access `/nyx admin` (leave empty for Administrator-only)

---

## How Tiers Are Assigned

The enforcement engine walks through tiers from most severe to least (DELETE → QUARANTINE → WARN) and stops at the first tier whose triggers match the link's signals.

### Signals
Each scanner check pushes one or more signal codes into the verdict. Example signals:
- `SAFE_BROWSING_MATCH` — Google confirmed threat
- `BLOCKLIST_HIT` — domain on server blocklist
- `YOUNG_DOMAIN` — domain < 30 days old
- `HEURISTIC_CRITICAL` — heuristic score >= delete threshold
- `HEURISTIC_HIGH` — heuristic score in upper warn band
- `HEURISTIC_LOW` — heuristic score in lower warn band
- `TYPOSQUAT` — Levenshtein-close to a known brand (e.g. g00gle.com)
- `RATE_LIMIT_HIT` — user exceeded link rate limit
- `MANY_SUBDOMAINS`, `LONG_URL`, `IP_ADDRESS`, `UNUSUAL_TLD`, `SUSPICIOUS_PATH`, `OBFUSCATED_PATH`, `MULTIPLE_AT`

### Tier Triggers
Defined in `config/tiers.js`:
- **DELETE** fires if: `SAFE_BROWSING_MATCH`, `BLOCKLIST_HIT`, or `HEURISTIC_CRITICAL`
- **QUARANTINE** fires if: `HEURISTIC_HIGH` or `YOUNG_DOMAIN_PLUS` (young domain + another warn signal)
- **WARN** fires if: `YOUNG_DOMAIN`, `RATE_LIMIT_HIT`, or `HEURISTIC_LOW`

If no tier matches, the link is safe.

---

## Extending Nyx

### Add a new scanner check
1. Create a file in `src/scanner/` that exports an async function
2. Import it in `src/scanner/index.js` and add it to the `Promise.all` block
3. Push new signal codes into the `signals` array based on your check's results
4. (Optional) Add your signal to a tier's `triggers` array in `config/tiers.js`

### Add a new admin panel section
1. Create a handler file in `src/admin/` (e.g. `myFeature.js`)
2. Export a `handleMyFeature(interaction, rest)` function
3. Add a button to `src/admin/mainMenu.js` with customId `nyx:myfeature:show`
4. Add a case in `src/admin/index.js` → `handleInteraction()` to route to your handler

---

## Database Schema

Single-file schema in `src/db/schema.sql`. Tables:
- **guilds** — per-guild settings (log channel, admin roles)
- **allowlist** — trusted domains per guild
- **blocklist** — blocked domains per guild
- **link_logs** — append-only audit trail of every link
- **user_stats** — running counters for reputation tracking
- **review_queue** — quarantined links awaiting mod review

---

## License

MIT — see LICENSE file for details.
