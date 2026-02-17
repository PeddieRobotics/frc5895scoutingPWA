import { NextResponse } from 'next/server';
import { validateAuthToken } from '../../../../lib/auth';
import {
  initializeGameConfigsTable,
  getAllGames,
  createGame,
  getGameDataCount,
} from '../../../../lib/game-config';
import { validateConfig } from '../../../../lib/config-validator';
import { extractFieldsFromConfig, extractTimerFieldsFromConfig, sanitizeScoutLeadsTableName } from '../../../../lib/schema-generator';

export const revalidate = 0;

/**
 * GET /api/admin/games
 * List all game configurations
 */
export async function GET(request) {
  // Validate auth
  const { isValid, error } = await validateAuthToken(request);
  if (!isValid) {
    return NextResponse.json(
      { message: error || 'Authentication required' },
      { status: 401 }
    );
  }

  try {
    // Initialize table if needed
    console.log('[Games API] Initializing game_configs table...');
    await initializeGameConfigsTable();
    console.log('[Games API] Table initialized successfully');

    // Get all games
    console.log('[Games API] Fetching all games...');
    const games = await getAllGames();
    console.log(`[Games API] Found ${games.length} games`);

    // Add data counts for each game
    const gamesWithCounts = await Promise.all(
      games.map(async (game) => {
        try {
          const dataCount = await getGameDataCount(game.table_name);
          return {
            ...game,
            dataCount,
          };
        } catch (err) {
          console.warn(`[Games API] Could not get data count for ${game.table_name}:`, err.message);
          return {
            ...game,
            dataCount: 0,
          };
        }
      })
    );

    return NextResponse.json({
      success: true,
      games: gamesWithCounts,
    });
  } catch (error) {
    console.error('[Games API] Error listing games:', error);
    console.error('[Games API] Error stack:', error.stack);
    return NextResponse.json(
      { message: 'Failed to list games', error: error.message, stack: error.stack },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/games
 * Create a new game configuration
 */
export async function POST(request) {
  // Validate auth
  const { isValid, teamName, error } = await validateAuthToken(request);
  if (!isValid) {
    return NextResponse.json(
      { message: error || 'Authentication required' },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const { gameName, displayName, configJson } = body;

    // Validate required fields
    if (!gameName || !displayName || !configJson) {
      return NextResponse.json(
        { message: 'Missing required fields: gameName, displayName, configJson' },
        { status: 400 }
      );
    }

    // Parse configJson if it's a string
    let config = configJson;
    if (typeof configJson === 'string') {
      try {
        config = JSON.parse(configJson);
      } catch (e) {
        return NextResponse.json(
          { message: 'Invalid JSON configuration', error: e.message },
          { status: 400 }
        );
      }
    }

    // Validate the configuration
    const validationResult = validateConfig(config);
    if (!validationResult.valid) {
      return NextResponse.json(
        {
          message: 'Configuration validation failed',
          errors: validationResult.errors,
          warnings: validationResult.warnings,
        },
        { status: 400 }
      );
    }

    // Initialize table if needed
    await initializeGameConfigsTable();

    // Create the game
    const game = await createGame({
      gameName,
      displayName,
      configJson: config,
      createdBy: teamName,
    });

    return NextResponse.json({
      success: true,
      message: 'Game created successfully',
      game: {
        id: game.id,
        gameName: game.game_name,
        displayName: game.display_name,
        tableName: game.table_name,
        scoutLeadsTableName: game.scoutLeadsTableName,
        isActive: game.is_active,
        createdAt: game.created_at,
      },
      columnsCreated: game.columnsCreated,
      scoutLeadsColumnsCreated: game.scoutLeadsColumnsCreated,
      warnings: validationResult.warnings,
    });
  } catch (error) {
    console.error('[Games API] Error creating game:', error);
    return NextResponse.json(
      { message: 'Failed to create game', error: error.message },
      { status: 500 }
    );
  }
}

/**
 * OPTIONS /api/admin/games
 * Preview what columns would be created for a config
 */
export async function OPTIONS(request) {
  try {
    const body = await request.json();
    const { configJson } = body;

    if (!configJson) {
      return NextResponse.json(
        { message: 'configJson is required' },
        { status: 400 }
      );
    }

    // Parse configJson if it's a string
    let config = configJson;
    if (typeof configJson === 'string') {
      try {
        config = JSON.parse(configJson);
      } catch (e) {
        return NextResponse.json(
          { message: 'Invalid JSON', error: e.message },
          { status: 400 }
        );
      }
    }

    // Validate the configuration
    const validationResult = validateConfig(config);

    // Extract fields to show what would be created
    const fields = extractFieldsFromConfig(config);
    const timerFields = extractTimerFieldsFromConfig(config);

    return NextResponse.json({
      valid: validationResult.valid,
      errors: validationResult.errors,
      warnings: validationResult.warnings,
      scoutLeadsTableName: sanitizeScoutLeadsTableName(config.gameName || 'new_game'),
      fieldsToCreate: fields.map((f) => ({
        name: f.name,
        type: f.type,
        default: f.default,
        required: f.required,
        label: f.label,
      })),
      scoutLeadsFieldsToCreate: timerFields.map((field) => ({
        name: field.name,
        rateLabel: field.scoutLeadsRateLabel,
        type: field.scoutLeadsDbColumn?.type || 'NUMERIC(10,4)',
        default: field.scoutLeadsDbColumn?.default ?? 0,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { message: 'Validation failed', error: error.message },
      { status: 500 }
    );
  }
}
