// Mock pg implementation for client-side only
const isClient = typeof window !== 'undefined';

// Create mock Pool implementation for client-side
const MockPool = class {
  constructor() {}
  connect() {
    return Promise.resolve({
      query: () => Promise.resolve({ rows: [], rowCount: 0 }),
      release: () => {}
    });
  }
  query() {
    return Promise.resolve({ rows: [], rowCount: 0 });
  }
};

// Only use mock on client-side
let pgModule;

if (!isClient) {
  // On server, try to use the real pg
  try {
    pgModule = require('pg');
  } catch (err) {
    console.warn('Failed to load real pg module, using mock instead:', err);
    pgModule = { Pool: MockPool };
  }
} else {
  // On client, use the mock
  pgModule = { Pool: MockPool };
}

export const Pool = pgModule.Pool;
export default pgModule; 