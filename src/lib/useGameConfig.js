"use client";
import { useState, useEffect } from "react";

/**
 * Client-side hook to fetch the active game config.
 * @returns {{ config: Object|null, gameId: number|null, gameName: string|null, displayName: string|null, tableName: string|null, loading: boolean, error: string|null }}
 */
export default function useGameConfig() {
  const [config, setConfig] = useState(null);
  const [gameId, setGameId] = useState(null);
  const [gameName, setGameName] = useState(null);
  const [displayName, setDisplayName] = useState(null);
  const [tableName, setTableName] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchConfig() {
      try {
        const ts = Date.now();
        const resp = await fetch(`/api/admin/games/active?_ts=${ts}`, {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache, no-store, must-revalidate" },
        });

        if (!resp.ok) {
          throw new Error(`Failed to fetch game config: ${resp.status}`);
        }

        const data = await resp.json();
        const resolvedGame = {
          gameId: data.gameId ?? null,
          gameName: data.gameName ?? null,
          displayName: data.displayName ?? null,
          tableName: data.tableName ?? null,
          config: data.config || data.config_json || null,
        };

        if (!cancelled) {
          setConfig(resolvedGame.config);
          setGameId(resolvedGame.gameId);
          setGameName(resolvedGame.gameName);
          setDisplayName(resolvedGame.displayName);
          setTableName(resolvedGame.tableName);
          setError(null);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("[useGameConfig]", err);
          setError(err.message);
          setLoading(false);
        }
      }
    }

    fetchConfig();
    return () => { cancelled = true; };
  }, []);

  return { config, gameId, gameName, displayName, tableName, loading, error };
}
