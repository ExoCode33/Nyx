# 🌙 Nyx

A Discord link watchdog bot with multi-layer threat detection, tiered enforcement, and an interactive admin panel.

## Project Structure

```
nyx/
├── src/
│   ├── index.js          # Main entry point
│   ├── commands/         # Slash commands
│   │   └── admin.js      # Admin panel command
│   ├── events/           # Discord event handlers
│   │   ├── ready.js
│   │   ├── guildCreate.js
│   │   ├── messageCreate.js
│   │   └── interactionCreate.js
│   ├── utils/            # Helper modules
│   │   ├── scanner/      # Link scanning (Safe Browsing, heuristics, etc.)
│   │   ├── enforcement/  # Tiered actions (warn, quarantine, delete)
│   │   ├── logger/       # Log channel management
│   │   └── admin/        # Admin panel UI components
│   └── models/           # Database layer
│       ├── database.js   # Connection + queries
│       └── schema.sql    # Database schema
├── config/               # Configuration
│   ├── index.js
│   ├── defaults.js
│   └── tiers.js
├── package.json
├── .env.example
└── README.md
```

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env with your tokens and database URL
```

### 3. Initialize database
```bash
psql $DATABASE_URL < src/models/schema.sql
```

### 4. Run the bot
```bash
npm start
```

## Features

- **Multi-layer scanning**: Redirect resolution, Google Safe Browsing, domain age, heuristic scoring
- **Tiered enforcement**: WARN → QUARANTINE → DELETE
- **Interactive admin panel**: `/nyx admin` with buttons, dropdowns, modals
- **Review queue**: Multi-select approve/deny quarantined links
- **User reputation**: Track link safety stats per user

## Configuration

All settings in `.env` (see `.env.example` for details):
- `DISCORD_TOKEN` - Bot token
- `SAFE_BROWSING_API_KEY` - Google API key
- `DATABASE_URL` - PostgreSQL connection string
- Optional: Thresholds for domain age, heuristic scoring, rate limiting

## Commands

- `/nyx admin` - Opens ephemeral admin panel (requires Administrator or configured roles)

## License

MIT
