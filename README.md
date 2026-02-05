# 🛡️ Nyx Watchdog - Discord Link Security Bot

A production-ready Discord bot that protects servers from malicious links through multi-layer threat detection, intelligent heuristics, and automated enforcement.

## ✨ Features

### 🔍 Multi-Layer Threat Detection
- **Google Safe Browsing** - Real-time malware/phishing detection
- **Heuristic Analysis** - Pattern-based threat scoring including:
  - Typosquatting detection with leetspeak normalization
  - Suspicious TLD and domain patterns
  - Phishing keyword detection
  - URL obfuscation detection
  - Homograph attack detection
- **Domain Age Verification** - WHOIS lookups to detect newly registered domains
- **Redirect Resolution** - Follows redirect chains to discover final destinations
- **Allowlist/Blocklist** - Server-specific domain filtering

### ⚖️ Tiered Enforcement System
- **🟢 Safe** - Link passes all security checks
- **⚠️ Warn** - Suspicious patterns detected, warning posted
- **🟠 Quarantine** - Potentially dangerous, deleted and sent for review
- **🔴 Delete** - Confirmed malicious, immediately removed with user notification

### 📊 Advanced Features
- **Rate Limiting** - Prevents link spam
- **User Reputation Tracking** - Per-user statistics across servers
- **Review Queue** - Moderator dashboard for quarantined links
- **Comprehensive Logging** - Full audit trail of all scanned links
- **Caching System** - Performance optimization for API calls
- **Structured Logging** - Production-ready logging with Pino

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ and npm
- PostgreSQL database (Railway provides this)
- Discord bot token
- Google Safe Browsing API key (optional but recommended)

### Railway Deployment (Recommended)

1. **Fork this repository**

2. **Create a new project on Railway**
   - Go to [railway.app](https://railway.app)
   - Click "New Project" → "Deploy from GitHub repo"
   - Select your forked repository

3. **Add PostgreSQL database**
   - In your Railway project, click "New"
   - Select "Database" → "PostgreSQL"
   - Railway will automatically set the `DATABASE_URL` environment variable

4. **Configure environment variables**
   - Go to your service settings → "Variables"
   - Add the following variables:

```env
DISCORD_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_discord_client_id
SAFE_BROWSING_API_KEY=your_google_api_key
NODE_ENV=production
LOG_LEVEL=info
```

5. **Initialize the database**
   - Once deployed, run the initialization script:
   - In Railway, go to your service → "Settings" → "Deploy"
   - Or manually run: `npm run db:init`

6. **Deploy your bot**
   - Railway will automatically deploy
   - Check logs to confirm successful startup

### Local Development

1. **Clone the repository**
```bash
git clone https://github.com/yourusername/nyx-watchdog.git
cd nyx-watchdog
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure environment**
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. **Set up database**
```bash
npm run db:init
```

5. **Start the bot**
```bash
npm run dev  # Development with auto-reload
npm start    # Production
```

## 📝 Configuration

### Required Environment Variables

| Variable | Description |
|----------|-------------|
| `DISCORD_TOKEN` | Your Discord bot token |
| `DISCORD_CLIENT_ID` | Your Discord application client ID |
| `DATABASE_URL` | PostgreSQL connection string |

### Optional Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `SAFE_BROWSING_API_KEY` | - | Google Safe Browsing API key |
| `NODE_ENV` | development | Environment (production/development) |
| `LOG_LEVEL` | info | Logging level (debug/info/warn/error) |
| `HEURISTIC_WARN_THRESHOLD` | 25 | Score threshold for warnings |
| `HEURISTIC_QUARANTINE_THRESHOLD` | 50 | Score threshold for quarantine |
| `HEURISTIC_DELETE_THRESHOLD` | 75 | Score threshold for deletion |
| `DOMAIN_AGE_THRESHOLD_DAYS` | 30 | Days to consider domain "young" |
| `RATE_LIMIT_MAX_LINKS` | 5 | Max links per user per window |
| `RATE_LIMIT_WINDOW_MS` | 60000 | Rate limit window (ms) |
| `WARN_MESSAGE_TTL_MS` | 300000 | Auto-delete warning after (ms) |

See `.env.example` for all available options.

## 🎮 Commands

### `/nyx stats`
View server-wide link security statistics including total scans, detection rates, and enforcement breakdown.

### `/nyx allowlist <action> [domain] [reason]`
Manage allowlisted domains that bypass all scanning.
- `add` - Add a domain to allowlist
- `remove` - Remove a domain from allowlist
- `list` - View all allowlisted domains

### `/nyx blocklist <action> [domain] [reason]`
Manage blocklisted domains that trigger immediate deletion.
- `add` - Add a domain to blocklist
- `remove` - Remove a domain from blocklist
- `list` - View all blocklisted domains

### `/nyx review`
View quarantined links pending moderator review.

### `/nyx user <target>`
View link statistics for a specific user including reputation score.

## 🏗️ Architecture

```
nyx-watchdog/
├── src/
│   ├── index.js                 # Main entry point
│   ├── commands/                # Slash commands
│   │   └── admin.js
│   ├── events/                  # Discord event handlers
│   │   ├── ready.js
│   │   ├── messageCreate.js
│   │   └── guildCreate.js
│   ├── services/                # Core business logic
│   │   ├── urlScanner.js        # Main scanner orchestrator
│   │   ├── heuristicScanner.js  # Pattern-based detection
│   │   ├── redirectResolver.js  # Redirect chain following
│   │   ├── safeBrowsing.js      # Google API integration
│   │   ├── domainAge.js         # WHOIS lookups
│   │   └── enforcement.js       # Enforcement actions
│   ├── database/                # Data layer
│   │   ├── pool.js              # Connection pool
│   │   ├── repository.js        # Database operations
│   │   ├── schema.sql           # Database schema
│   │   └── init.js              # Initialization script
│   ├── middleware/              # Request middleware
│   │   └── rateLimiter.js       # Rate limiting
│   └── utils/                   # Utilities
│       └── logger.js            # Structured logging
├── config/                      # Configuration
│   ├── index.js                 # Config management
│   └── tiers.js                 # Enforcement tiers
├── package.json
├── .env.example
└── README.md
```

## 🔒 Permissions

The bot requires the following Discord permissions:
- **Read Messages/View Channels** - To see messages
- **Send Messages** - To post warnings and notifications
- **Manage Messages** - To delete malicious links
- **Embed Links** - To send rich embeds
- **Read Message History** - To access message content

Bot invite link with correct permissions:
```
https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=93248&scope=bot%20applications.commands
```

## 📊 Database Schema

The bot uses PostgreSQL with the following tables:
- **guilds** - Server configuration
- **allowlist** - Trusted domains
- **blocklist** - Blocked domains
- **link_logs** - Complete audit trail
- **user_stats** - Reputation tracking
- **review_queue** - Quarantined links
- **cache** - API result caching

## 🛠️ Development

### Running Tests
```bash
npm test
```

### Linting
```bash
npm run lint
```

### Database Migrations
```bash
npm run db:migrate
```

## 📈 Performance

- **Caching**: All external API calls are cached
  - Safe Browsing results: 1 hour
  - WHOIS results: 24 hours
- **Connection Pooling**: PostgreSQL connections are pooled for efficiency
- **Parallel Scanning**: All detection layers run concurrently
- **Rate Limiting**: Built-in protection against abuse

## 🔧 Troubleshooting

### Bot not responding
1. Check bot token is correct
2. Verify bot has message content intent enabled
3. Check database connection
4. Review logs for errors

### Links not being scanned
1. Verify bot has "Read Messages" permission
2. Check message content intent is enabled in Discord Developer Portal
3. Ensure bot role is positioned correctly in role hierarchy

### Database connection errors
1. Verify DATABASE_URL is correct
2. Check PostgreSQL is running
3. Ensure database schema is initialized (`npm run db:init`)

### High API usage
1. Enable caching (default: enabled)
2. Adjust cache TTL values
3. Consider disabling optional features (WHOIS, Safe Browsing)

## 🤝 Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🙏 Credits

- Built with [discord.js](https://discord.js.org/)
- Powered by [Google Safe Browsing API](https://developers.google.com/safe-browsing)
- Database: [PostgreSQL](https://www.postgresql.org/)
- Logging: [Pino](https://getpino.io/)

## 📞 Support

- GitHub Issues: [Report bugs or request features](https://github.com/yourusername/nyx-watchdog/issues)
- Documentation: This README and inline code comments

## 🎯 Roadmap

- [ ] Web dashboard for detailed analytics
- [ ] Multi-language support
- [ ] Machine learning threat detection
- [ ] Integration with additional threat intelligence APIs
- [ ] Advanced reporting and export features
- [ ] Webhook notifications
- [ ] Custom enforcement rules per server

---

**Made with ❤️ for Discord server security**
