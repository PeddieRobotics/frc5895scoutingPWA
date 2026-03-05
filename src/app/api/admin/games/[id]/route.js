import { NextResponse } from 'next/server';
import { validateAuthToken } from '../../../../../lib/auth';
import {
  getGameById,
  updateGame,
  deleteGame,
  getGameDataCount,
  getTableColumns,
  getScoutLeadsTableName,
  migrateScoutingTable,
  migrateScoutLeadsTable,
} from '../../../../../lib/game-config';
import { validateConfig } from '../../../../../lib/config-validator';
import {
  extractFieldsFromConfig,
  extractTimerFieldsFromConfig,
} from '../../../../../lib/schema-generator';

export const revalidate = 0;

/**
 * GET /api/admin/games/[id]
 * Get a specific game configuration
 */
export async function GET(request, { params }) {
  // Validate auth
  const { isValid, error } = await validateAuthToken(request);
  if (!isValid) {
    return NextResponse.json(
      { message: error || 'Authentication required' },
      { status: 401 }
    );
  }

  try {
    const { id } = await params;
    const gameId = parseInt(id, 10);

    if (isNaN(gameId)) {
      return NextResponse.json(
        { message: 'Invalid game ID' },
        { status: 400 }
      );
    }

    const game = await getGameById(gameId);

    if (!game) {
      return NextResponse.json(
        { message: 'Game not found' },
        { status: 404 }
      );
    }

    // Get additional info
    const dataCount = await getGameDataCount(game.table_name);
    const columns = await getTableColumns(game.table_name);

    return NextResponse.json({
      success: true,
      game: {
        id: game.id,
        gameName: game.game_name,
        displayName: game.display_name,
        tableName: game.table_name,
        config: game.config_json,
        isActive: game.is_active,
        tbaEventCode: game.tba_event_code || game.config_json?.tbaEventCode || '',
        createdAt: game.created_at,
        updatedAt: game.updated_at,
        createdBy: game.created_by,
        dataCount,
        columns,
      },
    });
  } catch (error) {
    console.error('[Games API] Error getting game:', error);
    return NextResponse.json(
      { message: 'Failed to get game', error: error.message },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/games/[id]
 * Update a game configuration
 */
export async function PUT(request, { params }) {
  // Validate auth
  const { isValid, error } = await validateAuthToken(request);
  if (!isValid) {
    return NextResponse.json(
      { message: error || 'Authentication required' },
      { status: 401 }
    );
  }

  try {
    const { id } = await params;
    const gameId = parseInt(id, 10);

    if (isNaN(gameId)) {
      return NextResponse.json({ message: 'Invalid game ID' }, { status: 400 });
    }

    const body = await request.json();
    const { displayName, configJson, tbaEventCode } = body;

    // Parse and validate configJson if provided
    let parsedConfig = undefined;
    if (configJson !== undefined) {
      if (typeof configJson === 'string') {
        try {
          parsedConfig = JSON.parse(configJson);
        } catch (e) {
          return NextResponse.json(
            { message: 'Invalid JSON configuration', error: e.message },
            { status: 400 }
          );
        }
      } else {
        parsedConfig = configJson;
      }

      const validationResult = validateConfig(parsedConfig);
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
    }

    // Get current game
    const currentGame = await getGameById(gameId);
    if (!currentGame) {
      return NextResponse.json({ message: 'Game not found' }, { status: 404 });
    }

    // If tbaEventCode is being updated standalone (no full config replacement),
    // patch it into the current config_json so the column and JSON stay in sync.
    if (tbaEventCode !== undefined && parsedConfig === undefined) {
      const currentConfig = { ...currentGame.config_json };
      if (tbaEventCode) {
        currentConfig.tbaEventCode = tbaEventCode;
      } else {
        delete currentConfig.tbaEventCode;
      }
      parsedConfig = currentConfig;
    } else if (tbaEventCode !== undefined && parsedConfig !== undefined) {
      // Explicit tbaEventCode takes precedence over what's in the JSON
      if (tbaEventCode) {
        parsedConfig.tbaEventCode = tbaEventCode;
      } else {
        delete parsedConfig.tbaEventCode;
      }
    }

    // Run schema migrations for new fields
    let columnsAdded = [];
    if (parsedConfig !== undefined) {
      const currentColumns = await getTableColumns(currentGame.table_name);
      const currentColNames = new Set(currentColumns.map(c => c.column_name));

      const newFields = extractFieldsFromConfig(parsedConfig);
      const addedFields = newFields.filter(f => !currentColNames.has(f.name));

      if (addedFields.length > 0) {
        const result = await migrateScoutingTable(currentGame.table_name, addedFields);
        columnsAdded = result.columnsAdded;
      }

      const newTimerFields = extractTimerFieldsFromConfig(parsedConfig);
      if (newTimerFields.length > 0) {
        const scoutLeadsTableName = getScoutLeadsTableName(currentGame.game_name);
        await migrateScoutLeadsTable(scoutLeadsTableName, newTimerFields);
      }
    }

    // Update the game config and/or display name
    const game = await updateGame(gameId, { displayName, configJson: parsedConfig });

    return NextResponse.json({
      success: true,
      message: 'Game updated successfully',
      columnsAdded,
      game: {
        id: game.id,
        gameName: game.game_name,
        displayName: game.display_name,
        tableName: game.table_name,
        isActive: game.is_active,
        updatedAt: game.updated_at,
      },
    });
  } catch (error) {
    console.error('[Games API] Error updating game:', error);
    return NextResponse.json(
      { message: 'Failed to update game', error: error.message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/games/[id]
 * Delete a game configuration
 */
export async function DELETE(request, { params }) {
  // Validate auth
  const { isValid, error } = await validateAuthToken(request);
  if (!isValid) {
    return NextResponse.json(
      { message: error || 'Authentication required' },
      { status: 401 }
    );
  }

  try {
    const { id } = await params;
    const gameId = parseInt(id, 10);

    if (isNaN(gameId)) {
      return NextResponse.json(
        { message: 'Invalid game ID' },
        { status: 400 }
      );
    }

    // Check for dropTable query param
    const { searchParams } = new URL(request.url);
    const dropTable = searchParams.get('dropTable') === 'true';

    // Delete the game
    const result = await deleteGame(gameId, dropTable);

    return NextResponse.json({
      success: true,
      message: `Game "${result.display_name}" deleted successfully`,
      tableDropped: result.tableDropped,
      tableName: result.table_name,
    });
  } catch (error) {
    console.error('[Games API] Error deleting game:', error);
    return NextResponse.json(
      { message: 'Failed to delete game', error: error.message },
      { status: 500 }
    );
  }
}
