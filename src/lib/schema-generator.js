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

const SCOUT_LEADS_CORE_FIELDS = [
  { name: 'scoutname', type: 'VARCHAR(100)', required: false, default: null },
  { name: 'scoutteam', type: 'VARCHAR(50)', required: false, default: null },
  { name: 'team', type: 'INTEGER', required: true, default: null },
  { name: 'match', type: 'INTEGER', required: true, default: null },
  { name: 'matchtype', type: 'INTEGER', required: false, default: 2 },
  { name: 'timestamp', type: 'TIMESTAMP', required: false, default: 'CURRENT_TIMESTAMP' },
  { name: 'comment', type: 'TEXT', required: false, default: null },
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
    if (!field) return;

    // Container types (collapsible, table) have no own name — process their children directly
    if (field.type === 'collapsible') {
      if (field.trigger) processField(field.trigger);
      if (field.content) field.content.forEach(f => processField(f));
      return;
    }
    if (field.type === 'table') {
      if (field.rows) {
        field.rows.forEach(row => {
          if (row.fields) row.fields.forEach(f => processField(f));
        });
      }
      return;
    }

    if (!field.name || fieldNames.has(field.name)) {
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
      case 'holdTimer':
        fieldNames.add(field.name);
        fields.push({
          name: field.name,
          type: dbColumn.type || (field.type === 'holdTimer' ? 'NUMERIC(10,3)' : 'INTEGER'),
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
      case 'imageSelect':
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
    case 'holdTimer':
      return { type: 'NUMERIC(10,3)', default: 0 };
    case 'text':
      return { type: 'VARCHAR(500)', default: null };
    case 'comment':
      return { type: 'TEXT', default: null };
    case 'singleSelect':
    case 'imageSelect':
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
function sanitizeTableName(gameName, prefix = 'scouting_') {
  // Convert to lowercase, replace spaces and special chars with underscores
  let sanitized = gameName
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');

  // Ensure it starts with a letter
  if (/^[0-9]/.test(sanitized)) {
    sanitized = prefix + sanitized;
  }

  // Prefix if not already present
  if (!sanitized.startsWith(prefix)) {
    sanitized = prefix + sanitized;
  }

  // Truncate if too long (max 63 chars for PostgreSQL)
  if (sanitized.length > 63) {
    sanitized = sanitized.substring(0, 63);
  }

  return sanitized;
}

function sanitizeScoutLeadsTableName(gameName) {
  return sanitizeTableName(gameName, 'scoutleads_');
}

function sanitizeOprSettingsTableName(gameName) {
  return sanitizeTableName(gameName, 'opr_settings_');
}

function sanitizePrescoutTableName(gameName) {
  return sanitizeTableName(gameName, 'prescout_');
}

function sanitizePhotosTableName(gameName) {
  return sanitizeTableName(gameName, 'photos_');
}

function sanitizeFieldImagesTableName(gameName) {
  return sanitizeTableName(gameName, 'fieldimages_');
}

/**
 * Walk all fields in a config and extract imageTag references from imageSelect fields.
 * @param {Object} config - The game configuration JSON
 * @returns {Array<{ tag: string, fieldName: string, fieldLabel: string }>}
 */
function extractImageTagsFromConfig(config) {
  const tags = [];
  const seen = new Set();

  function processField(field) {
    if (!field) return;

    if (field.type === 'imageSelect' && field.imageTag && !seen.has(field.imageTag)) {
      seen.add(field.imageTag);
      tags.push({
        tag: field.imageTag,
        fieldName: field.name || '',
        fieldLabel: field.label || field.name || '',
      });
      return;
    }

    if (field.type === 'table' && Array.isArray(field.rows)) {
      field.rows.forEach((row) => {
        if (Array.isArray(row.fields)) row.fields.forEach(processField);
      });
      return;
    }

    if (field.type === 'collapsible') {
      if (field.trigger) processField(field.trigger);
      if (Array.isArray(field.content)) field.content.forEach(processField);
    }
  }

  if (config?.basics?.fields) {
    config.basics.fields.forEach(processField);
  }

  if (config?.sections) {
    config.sections.forEach((section) => {
      if (section?.fields) section.fields.forEach(processField);
    });
  }

  return tags;
}

function extractTimerFieldsFromConfig(config) {
  const timerFields = [];
  const seen = new Set();

  function processField(field) {
    if (!field) return;

    if (field.type === 'holdTimer' && field.name && !seen.has(field.name)) {
      seen.add(field.name);
      if (!field.scoutLeads) return; // raw-only field: no scout-leads rate, skip scoutleads table
      const dbColumn = field.dbColumn || getDefaultDbColumn('holdTimer');
      const scoutLeadsDbColumn = field.scoutLeads?.dbColumn || { type: 'NUMERIC(10,4)', default: 0 };
      const rateDefaultFromConfig = field.scoutLeads?.defaultRate;

      timerFields.push({
        name: field.name,
        label: field.label || field.name,
        dbColumn: {
          type: dbColumn.type || 'NUMERIC(10,3)',
          default: dbColumn.default !== undefined ? dbColumn.default : 0,
        },
        scoutLeadsRateLabel: field.scoutLeads?.rateLabel || `${field.label || field.name} per second`,
        scoutLeadsRatePlaceholder: field.scoutLeads?.placeholder || '',
        scoutLeadsDbColumn: {
          type: scoutLeadsDbColumn.type || 'NUMERIC(10,4)',
          default: scoutLeadsDbColumn.default !== undefined
            ? scoutLeadsDbColumn.default
            : (rateDefaultFromConfig !== undefined ? rateDefaultFromConfig : 0),
        },
        group: field.scoutLeads?.group || null,
        groupLabel: field.scoutLeads?.groupLabel || field.scoutLeads?.group || null,
      });
      return;
    }

    if (field.type === 'table' && Array.isArray(field.rows)) {
      field.rows.forEach((row) => {
        if (Array.isArray(row.fields)) {
          row.fields.forEach((nestedField) => processField(nestedField));
        }
      });
      return;
    }

    if (field.type === 'collapsible') {
      if (field.trigger) {
        processField(field.trigger);
      }
      if (Array.isArray(field.content)) {
        field.content.forEach((nestedField) => processField(nestedField));
      }
    }
  }

  if (config?.basics?.fields) {
    config.basics.fields.forEach((field) => processField(field));
  }

  if (config?.sections) {
    config.sections.forEach((section) => {
      if (section?.fields) {
        section.fields.forEach((field) => processField(field));
      }
    });
  }

  return timerFields;
}

function generateCreateScoutLeadsTableSQL(tableName, timerFields = []) {
  const timerColumns = timerFields.map((field) => ({
    name: field.name,
    type: field.scoutLeadsDbColumn?.type || 'NUMERIC(10,4)',
    required: false,
    default: field.scoutLeadsDbColumn?.default !== undefined ? field.scoutLeadsDbColumn.default : 0,
  }));

  const allColumns = [...SCOUT_LEADS_CORE_FIELDS, ...timerColumns];

  const columnDefs = allColumns.map((column) => {
    let def = `${column.name} ${column.type}`;

    if (column.required) {
      def += ' NOT NULL';
    }

    if (column.default !== undefined && column.default !== null) {
      if (typeof column.default === 'boolean') {
        def += ` DEFAULT ${column.default ? 'TRUE' : 'FALSE'}`;
      } else if (typeof column.default === 'string' && column.default.includes('CURRENT')) {
        def += ` DEFAULT ${column.default}`;
      } else if (typeof column.default === 'number') {
        def += ` DEFAULT ${column.default}`;
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
    .filter((f) => {
      const type = (f.type || '').toUpperCase();
      return type === 'INTEGER' || type.startsWith('NUMERIC') || type.startsWith('DECIMAL');
    })
    .map(f => f.name);
}

/**
 * Determine which fields are boolean (for form processing)
 * @param {Array} fields - Array of field definitions
 * @returns {Array} Array of boolean field names
 */
function getBooleanFields(fields) {
  return fields
    .filter((f) => (f.type || '').toUpperCase() === 'BOOLEAN')
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

/**
 * Extract all checkbox fields that carry a scoringRequirement tag.
 * Returns [{ name, label, requiredValue }] in config order.
 * requiredValue: true  → row is excluded when the field is false/falsy
 * requiredValue: false → row is excluded when the field is true/truthy
 * @param {Object} config - The game configuration JSON
 * @returns {Array<{ name: string, label: string, requiredValue: boolean }>}
 */
function extractScoringRequirementFields(config) {
  const fields = [];
  const seen = new Set();

  function processField(field) {
    if (!field) return;

    if (
      field.type === 'checkbox' &&
      field.name &&
      !seen.has(field.name) &&
      field.scoringRequirement &&
      typeof field.scoringRequirement.requiredValue === 'boolean'
    ) {
      seen.add(field.name);
      fields.push({
        name: field.name,
        label: field.label || field.name,
        requiredValue: field.scoringRequirement.requiredValue,
      });
      return;
    }

    if (field.type === 'table' && Array.isArray(field.rows)) {
      field.rows.forEach((row) => {
        if (Array.isArray(row.fields)) row.fields.forEach(processField);
      });
      return;
    }

    if (field.type === 'collapsible') {
      if (field.trigger) processField(field.trigger);
      if (Array.isArray(field.content)) field.content.forEach(processField);
    }
  }

  if (config?.basics?.fields) {
    config.basics.fields.forEach(processField);
  }

  if (config?.sections) {
    config.sections.forEach((section) => {
      if (section?.fields) section.fields.forEach(processField);
    });
  }

  return fields;
}

/**
 * Find the single field marked with isConfidenceRating: true in the config.
 * Supports starRating/qualitative (gradient 1–6) and checkbox (boolean ratio).
 * Returns { name, label, fieldType, invertColor } or null if none.
 * @param {Object} config - The game configuration JSON
 * @returns {{ name: string, label: string, fieldType: string, invertColor: boolean } | null}
 */
function extractConfidenceRatingField(config) {
  let found = null;

  function processField(field) {
    if (!field || found) return;

    if (field.isConfidenceRating === true && field.name) {
      if (field.type === 'starRating' || field.type === 'qualitative') {
        found = { name: field.name, label: field.label || field.name, fieldType: 'qualitative', invertColor: false };
        return;
      }
      if (field.type === 'checkbox') {
        found = { name: field.name, label: field.label || field.name, fieldType: 'checkbox', invertColor: field.invertColor === true };
        return;
      }
    }

    if (field.type === 'table' && Array.isArray(field.rows)) {
      field.rows.forEach((row) => {
        if (Array.isArray(row.fields)) row.fields.forEach(processField);
      });
      return;
    }

    if (field.type === 'collapsible') {
      if (field.trigger) processField(field.trigger);
      if (Array.isArray(field.content)) field.content.forEach(processField);
    }
  }

  if (config?.basics?.fields) {
    config.basics.fields.forEach(processField);
  }

  if (config?.sections) {
    config.sections.forEach((section) => {
      if (section?.fields) section.fields.forEach(processField);
    });
  }

  return found;
}

export {
  extractFieldsFromConfig,
  extractConfidenceRatingField,
  extractScoringRequirementFields,
  extractTimerFieldsFromConfig,
  extractImageTagsFromConfig,
  generateCreateTableSQL,
  generateCreateScoutLeadsTableSQL,
  sanitizeTableName,
  sanitizeScoutLeadsTableName,
  sanitizeOprSettingsTableName,
  sanitizePrescoutTableName,
  sanitizePhotosTableName,
  sanitizeFieldImagesTableName,
  getFieldDefaults,
  getNumericFields,
  getBooleanFields,
  generateInsertTemplate,
  CORE_FIELDS,
  SCOUT_LEADS_CORE_FIELDS,
};
