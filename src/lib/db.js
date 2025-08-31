import { neon, neonConfig } from '@neondatabase/serverless';
import { Pool } from '@neondatabase/serverless';
import ws from 'ws';

// Configure Neon to use proper WebSocket implementation based on environment
// Next.js API routes execute on the server in both dev and prod.
const isServer = typeof window === 'undefined';
if (isServer) {
  neonConfig.webSocketConstructor = ws;
  neonConfig.useSecureWebSocket = true;
  neonConfig.pipelineTLS = true;
} else {
  neonConfig.webSocketConstructor = window.WebSocket;
  const isHttps = typeof location !== 'undefined' && location.protocol === 'https:';
  neonConfig.useSecureWebSocket = isHttps;
  neonConfig.pipelineTLS = isHttps;
}

// Create a pool instance for reuse
const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  // Add connection timeout to avoid hanging
  connectionTimeoutMillis: 5000
});

// Create a simple query client for one-off queries
const sql = neon(process.env.DATABASE_URL);

export { pool, sql }; 
