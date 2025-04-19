import { neon, neonConfig } from '@neondatabase/serverless';
import { Pool } from '@neondatabase/serverless';
import ws from 'ws';

// Configure neon client for WebSocket connections
if (process.env.NODE_ENV === 'production') {
  // In production/server environment, use the ws package
  neonConfig.webSocketConstructor = ws;
  neonConfig.useSecureWebSocket = true;
  neonConfig.pipelineTLS = true;
} else {
  // In development/client environment, use browser's WebSocket
  neonConfig.webSocketConstructor = globalThis.WebSocket;
  neonConfig.useSecureWebSocket = false;
  neonConfig.pipelineTLS = false;
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