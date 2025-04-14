// Mock bcrypt implementation for client-side only
const isClient = typeof window !== 'undefined';

// Create the mock implementation
const mockBcrypt = {
  hash: () => Promise.resolve('hashed_password_mock'),
  compare: () => Promise.resolve(true)
};

// Only use this mock on the client-side
let bcryptModule;

if (!isClient) {
  // On server, try to use the real bcrypt
  try {
    // Using dynamic import to avoid bundling issues
    bcryptModule = require('bcrypt');
  } catch (err) {
    console.warn('Failed to load real bcrypt, using mock instead:', err);
    bcryptModule = mockBcrypt;
  }
} else {
  // On client, use the mock
  bcryptModule = mockBcrypt;
}

export default bcryptModule; 