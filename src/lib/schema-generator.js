/**
 * Schema Generator for Dynamic Game Configurations
 * Extracts field definitions from JSON config and generates SQL for table creation
 */

// Core fields that always exist in every scouting table
const CORE_FIELDS = [
  { name: 'scoutname', type: 'VARCHAR(100)', required: true, default: null },
  { name: 'scoutteam', type: 'VARCHAR(50)', required: false, default: null },
  { name: 'team', type: 'INTEGER', required: true, default: null },
  { name: 'match', type: 'INTEGER', required: true, default: null },
  { name: 'matchtype', type: 'INTEGER', required: false, default: 2 },
  { name: 'noshow', type: 'BOOLEAN', required: false, default: false },
  { name: 'timestamp', type: 'TIMESTAMP', required: false, default: 'CURRENT_TIMESTAMP' },
];

/**
 * Extract all field definitions from a game config
 * @param {Object} config - The game configuration JSON
 * @returns {Array} Array of field definitions with name, type, default, required
 */
function extractFieldsFromConfig(config) {
  const fields = [];
  const fieldNames = new Set(CORE_FIELDS.map(f => f.name));

  function processField(field) {
    if (!field || !field.name || fieldNames.has(field.name)) {
      // Skip if already exists or invalid
      if (field && field.type === 'multiSelect' && field.options) {
        // For multiSelect, process each option as a separate boolean field
        field.options.forEach(opt => {
          if (opt.name && !fieldNames.has(opt.name)) {
            fieldNames.add(opt.name);
            const dbColumn = opt.dbColumn || { type: 'BOOLEAN', default: false };
            fields.push({
              name: opt.name,
              type: dbColumn.type || 'BOOLEAN',
              default: dbColumn.default !== undefined ? dbColumn.default : false,
              required: false,
              label: opt.label || opt.name,
            });
          }
        });
      }
      return;
    }

    const dbColumn = field.dbColumn || getDefaultDbColumn(field.type);

    switch (field.type) {
      case 'checkbox':
        fieldNames.add(field.name);
        fields.push({
          name: field.name,
          type: dbColumn.type || 'BOOLEAN',
          default: dbColumn.default !== undefined ? dbColumn.default : false,
          required: false,
          label: field.label || field.name,
        });
        break;

      case 'counter':
      case 'number':
        fieldNames.add(field.name);
        fields.push({
          name: field.name,
          type: dbColumn.type || 'INTEGER',
          default: dbColumn.default !== undefined ? dbColumn.default : 0,
          required: false,
          label: field.label || field.name,
        });
        break;

      case 'text':
        fieldNames.add(field.name);
        fields.push({
          name: field.name,
          type: dbColumn.type || 'VARCHAR(500)',
          default: dbColumn.default !== undefined ? dbColumn.default : null,
          required: false,
          label: field.label || field.name,
        });
        break;

      case 'comment':
        fieldNames.add(field.name);
        fields.push({
          name: field.name,
          type: dbColumn.type || 'TEXT',
          default: dbColumn.default !== undefined ? dbColumn.default : null,
          required: false,
          label: field.label || field.name,
        });
        break;

      case 'singleSelect':
        fieldNames.add(field.name);
        fields.push({
          name: field.name,
          type: dbColumn.type || 'INTEGER',
          default: dbColumn.default !== undefined ? dbColumn.default : null,
          required: false,
          label: field.label || field.name,
        });
        break;

      case 'multiSelect':
        // Each option becomes its own boolean column
        if (field.options) {
          field.options.forEach(opt => {
            if (opt.name && !fieldNames.has(opt.name)) {
              fieldNames.add(opt.name);
              const optDbColumn = opt.dbColumn || { type: 'BOOLEAN', default: false };
              fields.push({
                name: opt.name,
                type: optDbColumn.type || 'BOOLEAN',
                default: optDbColumn.default !== undefined ? optDbColumn.default : false,
                required: false,
                label: opt.label || opt.name,
              });
            }
          });
        }
        break;

      case 'starRating':
      case 'qualitative':
        fieldNames.add(field.name);
        fields.push({
          name: field.name,
          type: dbColumn.type || 'INTEGER',
          default: dbColumn.default !== undefined ? dbColumn.default : null,
          required: false,
          label: field.label || field.name,
        });
        break;

      case 'table':
        // Process fields within table rows
        if (field.rows) {
          field.rows.forEach(row => {
            if (row.fields) {
              row.fields.forEach(f => processField(f));
            }
          });
        }
        break;

      case 'collapsible':
        // Process the trigger field and content fields
        if (field.trigger) processField(field.trigger);
        if (field.content) {
          field.content.forEach(f => processField(f));
        }
        break;

      default:
        // Unknown field type, try to create a column anyway
        if (field.name) {
          fieldNames.add(field.name);
          fields.push({
            name: field.name,
            type: dbColumn.type || 'TEXT',
            default: dbColumn.default !== undefined ? dbColumn.default : null,
            required: false,
            label: field.label || field.name,
          });
        }
    }
  }

  // Process basics section
  if (config.basics?.fields) {
    config.basics.fields.forEach(f => {
      // Skip core fields that are always added
      if (!['scoutname', 'team', 'match', 'scoutteam', 'matchtype'].includes(f.name)) {
        processField(f);
      }
    });
  }

  // Process all sections
  if (config.sections) {
    config.sections.forEach(section => {
      if (section.fields) {
        section.fields.forEach(f => processField(f));
      }
    });
  }

  return [...CORE_FIELDS, ...fields];
}

/**
 * Get default database column definition based on field type
 * @param {string} fieldType - The field type from config
 * @returns {Object} Default dbColumn definition
 */
function getDefaultDbColumn(fieldType) {
  switch (fieldType) {
    case 'checkbox':
      return { type: 'BOOLEAN', default: false };
    case 'counter':
    case 'number':
      return { type: 'INTEGER', default: 0 };
    case 'text':
      return { type: 'VARCHAR(500)', default: null };
    case 'comment':
      return { type: 'TEXT', default: null };
    case 'singleSelect':
    case 'starRating':
    case 'qualitative':
      return { type: 'INTEGER', default: null };
    default:
      return { type: 'TEXT', default: null };
  }
}

/**
 * Generate CREATE TABLE SQL from field definitions
 * @param {string} tableName - Name for the new table
 * @param {Array} fields - Array of field definitions
 * @returns {string} SQL CREATE TABLE statement
 */
function generateCreateTableSQL(tableName, fields) {
  const columnDefs = fields.map(f => {
    let def = `${f.name} ${f.type}`;

    if (f.required) {
      def += ' NOT NULL';
    }

    if (f.default !== undefined && f.default !== null) {
      if (typeof f.default === 'boolean') {
        def += ` DEFAULT ${f.default ? 'TRUE' : 'FALSE'}`;
      } else if (typeof f.default === 'string' && f.default.includes('CURRENT')) {
        def += ` DEFAULT ${f.default}`;
      } else if (typeof f.default === 'number') {
        def += ` DEFAULT ${f.default}`;
      }
    }

    return def;
  });

  return `
    CREATE TABLE IF NOT EXISTS ${tableName} (
      id SERIAL PRIMARY KEY,
      ${columnDefs.join(',\n      ')}
    );
  `;
}

/**
 * Sanitize a game name to create a valid SQL table name
 * @param {string} gameName - The game name
 * @returns {string} Sanitized table name
 */
function sanitizeTableName(gameName) {
  // Convert to lowercase, replace spaces and special chars with underscores
  let sanitized = gameName
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');

  // Ensure it starts with a letter
  if (/^[0-9]/.test(sanitized)) {
    sanitized = 'scouting_' + sanitized;
  }

  // Prefix with scouting_ if not already
  if (!sanitized.startsWith('scouting_')) {
    sanitized = 'scouting_' + sanitized;
  }

  // Truncate if too long (max 63 chars for PostgreSQL)
  if (sanitized.length > 63) {
    sanitized = sanitized.substring(0, 63);
  }

  return sanitized;
}

/**
 * Get field defaults for form data initialization
 * @param {Array} fields - Array of field definitions
 * @returns {Object} Object with field names as keys and defaults as values
 */
function getFieldDefaults(fields) {
  const defaults = {};
  fields.forEach(f => {
    if (f.default !== undefined) {
      defaults[f.name] = f.default;
    } else {
      // Set sensible defaults based on type
      if (f.type === 'BOOLEAN') {
        defaults[f.name] = false;
      } else if (f.type === 'INTEGER') {
        defaults[f.name] = null;
      } else {
        defaults[f.name] = null;
      }
    }
  });
  return defaults;
}

/**
 * Determine which fields are numeric (for form processing)
 * @param {Array} fields - Array of field definitions
 * @returns {Array} Array of numeric field names
 */
function getNumericFields(fields) {
  return fields
    .filter(f => f.type === 'INTEGER' || f.type.startsWith('NUMERIC') || f.type.startsWith('DECIMAL'))
    .map(f => f.name);
}

/**
 * Determine which fields are boolean (for form processing)
 * @param {Array} fields - Array of field definitions
 * @returns {Array} Array of boolean field names
 */
function getBooleanFields(fields) {
  return fields
    .filter(f => f.type === 'BOOLEAN')
    .map(f => f.name);
}

/**
 * Generate an INSERT statement template for a table
 * @param {string} tableName - The table name
 * @param {Array} fields - Array of field definitions
 * @returns {Object} Object with columns array and placeholders string
 */
function generateInsertTemplate(tableName, fields) {
  const columns = fields.map(f => f.name);
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');

  return {
    columns,
    placeholders,
    sql: `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`,
  };
}

export {
  extractFieldsFromConfig,
  generateCreateTableSQL,
  sanitizeTableName,
  getFieldDefaults,
  getNumericFields,
  getBooleanFields,
  generateInsertTemplate,
  CORE_FIELDS,
};
