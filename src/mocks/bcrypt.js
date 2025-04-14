// Mock bcrypt implementation for client-side
export default {
  hash: () => Promise.resolve('hashed_password_mock'),
  compare: () => Promise.resolve(true)
}; 