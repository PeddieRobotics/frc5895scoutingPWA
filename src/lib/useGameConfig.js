"use client";
import { useState, useEffect } from "react";

// In-memory cache shared across components
let cachedConfig = null;
let cacheTimestamp = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Client-side hook to fetch the active game config.
 * Caches in memory with a 5-minute TTL.
 * @returns {{ config: Object|null, loading: boolean, error: string|null }}
 */
export default function useGameConfig() {
  const [config, setConfig] = useState(cachedConfig);
  const [loading, setLoading] = useState(!cachedConfig);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Use cache if fresh
    if (cachedConfig && cacheTimestamp && (Date.now() - cacheTimestamp < CACHE_TTL)) {
      setConfig(cachedConfig);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchConfig() {
      try {
        const resp = await fetch("/api/admin/games/active", {
          headers: { "Cache-Control": "no-cache" },
        });

        if (!resp.ok) {
          throw new Error(`Failed to fetch game config: ${resp.status}`);
        }

        const data = await resp.json();
        const gameConfig = data.config || data.config_json || null;

        if (!cancelled) {
          cachedConfig = gameConfig;
          cacheTimestamp = Date.now();
          setConfig(gameConfig);
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

  return { config, loading, error };
}
