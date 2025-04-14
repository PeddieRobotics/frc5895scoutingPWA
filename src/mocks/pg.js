// Mock pg implementation for client-side
export const Pool = class {
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

export default { Pool }; 