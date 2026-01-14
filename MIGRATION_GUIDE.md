# Game Configuration System Migration Guide

## Overview
The scouting app now uses a configurable game system. You must create and activate a game before the app will work.

## Quick Start

### 1. Access the Game Management Page
Navigate to: `/admin/games`

### 2. Create Your First Game

The easiest way to get started is to use the included REEFSCAPE 2025 configuration:

1. Click **"Create New Game"**
2. **Game Name (ID)**: `reefscape_2025`
3. **Display Name**: `REEFSCAPE 2025`
4. **JSON Configuration**: Copy the contents of `/src/configs/reefscape_2025.json` and paste it into the text area
5. Click **"Validate Config"** to check for errors
6. Click **"Create Game & Table"**
7. Click **"Set Active"** on the newly created game

That's it! The app is now ready to use.

## Database Schema

The system automatically creates a `game_configs` table on first access. If you encounter issues, you can manually create it:

```sql
CREATE TABLE IF NOT EXISTS game_configs (
  id SERIAL PRIMARY KEY,
  game_name VARCHAR(100) NOT NULL UNIQUE,
  display_name VARCHAR(200) NOT NULL,
  table_name VARCHAR(100) NOT NULL UNIQUE,
  config_json JSONB NOT NULL,
  is_active BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(100)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_single_active_game
ON game_configs (is_active) WHERE is_active = TRUE;
```

## Troubleshooting

### "Failed to list games" error

This usually means there's a database connection issue. Check:

1. Your `DATABASE_URL` environment variable is set correctly
2. Your database is running and accessible
3. Check the server console logs for detailed error messages

### "No active game configured" error

This means you need to:
1. Go to `/admin/games`
2. Create a game using the JSON config
3. Click "Set Active" on that game

### Can't find the JSON config file

The reference config is located at:
```
/src/configs/reefscape_2025.json
```

You can also create your own config following the same structure.

## Creating a New Game for a Different Season

1. Copy `/src/configs/reefscape_2025.json` as a template
2. Modify the `gameName`, `displayName`, and field definitions
3. Update the `calculations` section with the new game's scoring formula
4. Upload/paste the new config via the admin interface
5. The system will automatically create the appropriate database table

## Important Notes

- **Only one game can be active at a time**
- **The system no longer defaults to njbe2025** - you MUST have an active game configured
- **Deleting a game**: You can optionally delete the data table along with the game config
- **Editing configs**: You cannot edit a game config if it has data (to prevent data loss)
- **Table names**: Auto-generated from the game name (e.g., `scouting_reefscape_2025`)
