# 🎰 Poker Tournament Manager

A full-stack web application for managing home poker tournaments with a host dashboard and player-facing display.

## Features

### Host Dashboard (`/host`)
- Create and manage tournament games
- Configure tournament settings:
  - Speed (Turbo/Normal/Slow)
  - Number of players
  - Max re-entries per player
  - Tournament type (ICM, Knockout, Mystery KO)
  - Entry price
- Auto-calculated blind structures based on speed
- Auto-calculated starting stacks based on your chip set
- Chip distribution preview

### Game Management (`/host/game/:id`)
- Start, pause, and end tournaments
- Add player entries
- Record knockouts (with bounty tracking for KO tournaments)
- Advance blind levels manually
- Real-time stats:
  - Current/next blinds
  - Level timer
  - Active players
  - Average stack
  - Prize pool

### Public Display (`/display/:id`)
- Large, TV-friendly display for players
- Shows:
  - Total prize pool
  - Current blinds & ante
  - Next blinds & ante
  - Level countdown timer
  - Players remaining
  - Average stack
- Visual/audio alerts for level changes
- Break time overlay
- Casino-inspired dark theme

## Chip Set Configuration

The app is pre-configured for your chip set:
- 150 × $10 chips
- 100 × $20 chips
- 100 × $50 chips
- 100 × $100 chips
- 50 × $500 chips

## Setup Instructions

### Prerequisites
- Node.js 18+
- PostgreSQL database

### 1. Database Setup

Set your PostgreSQL connection URI as an environment variable:

```bash
export DATABASE_URL="postgresql://user:password@host:port/database"
```

The tables will be created automatically on first run.

### 2. Start the Backend

```bash
cd server
npm install
npm start
```

The API server runs on `http://localhost:3001`

### 3. Start the Frontend

```bash
cd client
npm install
npm run dev
```

The frontend runs on `http://localhost:5173`

### 4. Usage

1. Open `http://localhost:5173` for the host dashboard
2. Create a new tournament
3. Add players and configure settings
4. Open the public display URL (`/display/:id`) on a TV or second screen
5. Start the tournament and manage it from the host view

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tournaments` | List all tournaments |
| GET | `/api/tournaments/:id` | Get tournament details |
| POST | `/api/tournaments` | Create tournament |
| POST | `/api/tournaments/preview` | Preview tournament config |
| PATCH | `/api/tournaments/:id/status` | Update status (running/paused/ended) |
| PATCH | `/api/tournaments/:id/next-level` | Advance to next level |
| POST | `/api/tournaments/:id/entries` | Add player entry |
| POST | `/api/tournaments/:id/knockouts` | Record knockout |
| DELETE | `/api/tournaments/:id` | Delete tournament |

## Blind Structures

### Turbo (10 min levels)
Fast-paced games, 6 levels between breaks

### Normal (20 min levels)
Standard home game pace, 4 levels between breaks

### Slow (30 min levels)
Deeper stacks, more play, 3 levels between breaks

## Tournament Types

- **ICM**: Standard payout structure
- **Knockout (KO)**: 50% of buy-in as bounty per elimination
- **Mystery KO**: Random bounty multipliers (0.5x to 10x)

## Customization

### Modifying Chip Set
Edit the `CHIP_SET` constant in `server/index.js`:

```javascript
const CHIP_SET = {
  10: 150,  // denomination: count
  20: 100,
  50: 100,
  100: 100,
  500: 50
};
```

### Modifying Blind Structures
Edit the `BLIND_STRUCTURES` object in `server/index.js` to customize levels, timing, and breaks.

## License

MIT
