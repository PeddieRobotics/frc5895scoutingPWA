/**
 * Form Renderer Utility
 * Provides helper functions for rendering forms dynamically from config
 *
 * This utility helps the main page.js render form fields dynamically
 * based on the active game configuration
 */

/**
 * Get all field definitions from a config, flattened
 * @param {Object} config - The game configuration
 * @returns {Array} Array of field objects with their full paths
 */
function getAllFields(config) {
  const fields = [];

  function processField(field, path = '') {
    if (!field) return;

    const fieldPath = path ? `${path}.${field.name || field.id}` : (field.name || field.id);

    switch (field.type) {
      case 'table':
        // Process fields within table rows
        if (field.rows) {
          field.rows.forEach((row, rowIdx) => {
            if (row.fields) {
              row.fields.forEach(f => processField(f, `${fieldPath}.rows[${rowIdx}]`));
            }
          });
        }
        break;

      case 'collapsible':
        // Add the collapsible info and process trigger/content
        if (field.trigger) {
          processField(field.trigger, `${fieldPath}.trigger`);
        }
        if (field.content) {
          field.content.forEach((f, idx) => processField(f, `${fieldPath}.content[${idx}]`));
        }
        break;

      case 'multiSelect':
        // Each option is a separate field
        if (field.options) {
          field.options.forEach(opt => {
            fields.push({
              ...opt,
              type: 'checkbox',
              path: `${fieldPath}.options`,
              parentType: 'multiSelect',
            });
          });
        }
        break;

      default:
        // Standard field
        fields.push({
          ...field,
          path: fieldPath,
        });
    }
  }

  // Process basics section
  if (config.basics?.fields) {
    config.basics.fields.forEach(f => processField(f, 'basics'));
  }

  // Process all sections
  if (config.sections) {
    config.sections.forEach(section => {
      if (section.fields) {
        section.fields.forEach(f => processField(f, `sections.${section.id || section.header}`));
      }
    });
  }

  return fields;
}

/**
 * Get field defaults for initializing form state
 * @param {Object} config - The game configuration
 * @returns {Object} Object with field names as keys and default values
 */
function getFormDefaults(config) {
  const defaults = {};
  const fields = getAllFields(config);

  fields.forEach(field => {
    if (!field.name) return;

    // Use dbColumn default if available, otherwise infer from type
    const dbDefault = field.dbColumn?.default;

    if (dbDefault !== undefined) {
      defaults[field.name] = dbDefault;
    } else {
      switch (field.type) {
        case 'checkbox':
          defaults[field.name] = false;
          break;
        case 'counter':
        case 'number':
        case 'holdTimer':
          defaults[field.name] = 0;
          break;
        case 'starRating':
        case 'qualitative':
        case 'singleSelect':
          defaults[field.name] = null;
          break;
        default:
          defaults[field.name] = null;
      }
    }
  });

  return defaults;
}

/**
 * Determine which fields should be treated as numeric
 * @param {Object} config - The game configuration
 * @returns {Array} Array of numeric field names
 */
function getNumericFieldNames(config) {
  const fields = getAllFields(config);
  return fields
    .filter(f => ['counter', 'number', 'holdTimer', 'singleSelect', 'starRating', 'qualitative'].includes(f.type))
    .map(f => f.name)
    .filter(Boolean);
}

/**
 * Determine which fields should be treated as boolean
 * @param {Object} config - The game configuration
 * @returns {Array} Array of boolean field names
 */
function getBooleanFieldNames(config) {
  const fields = getAllFields(config);
  return fields
    .filter(f => f.type === 'checkbox')
    .map(f => f.name)
    .filter(Boolean);
}

/**
 * Determine which fields are text/comment fields
 * @param {Object} config - The game configuration
 * @returns {Array} Array of text field names
 */
function getTextFieldNames(config) {
  const fields = getAllFields(config);
  return fields
    .filter(f => ['text', 'comment'].includes(f.type))
    .map(f => f.name)
    .filter(Boolean);
}

/**
 * Get sections to display based on form state
 * @param {Object} config - The game configuration
 * @param {Object} formState - Current form state (e.g., { noshow: true })
 * @returns {Array} Array of sections that should be visible
 */
function getVisibleSections(config, formState) {
  if (!config.sections) return [];

  return config.sections.filter(section => {
    if (!section.showWhen) return true;

    const { field, equals } = section.showWhen;
    return formState[field] === equals;
  });
}

/**
 * Get all qualitative fields from config
 * @param {Object} config - The game configuration
 * @returns {Array} Array of qualitative/starRating field definitions
 */
function getQualitativeFields(config) {
  const fields = getAllFields(config);
  return fields.filter(f => ['starRating', 'qualitative'].includes(f.type));
}

/**
 * Get all comment fields from config
 * @param {Object} config - The game configuration
 * @returns {Array} Array of comment field definitions
 */
function getCommentFields(config) {
  const fields = getAllFields(config);
  return fields.filter(f => f.type === 'comment');
}

/**
 * Extract single select options by field name
 * @param {Object} config - The game configuration
 * @param {string} fieldName - The field name to find
 * @returns {Array|null} Options array or null if not found
 */
function getSingleSelectOptions(config, fieldName) {
  const fields = getAllFields(config);
  const field = fields.find(f => f.name === fieldName && f.type === 'singleSelect');
  return field?.options || null;
}

/**
 * Get the variant styling for a counter field
 * @param {Object} field - Field definition
 * @returns {string} CSS class name variant
 */
function getCounterVariant(field) {
  if (field.variant) return field.variant;
  if (field.name?.includes('success')) return 'Success';
  if (field.name?.includes('fail')) return 'Fail';
  return 'Counter';
}

/**
 * Check if a field should show based on visibility conditions
 * @param {Object} field - Field definition
 * @param {Object} formState - Current form state
 * @returns {boolean} Whether field should be visible
 */
function isFieldVisible(field, formState) {
  if (!field.showWhen) return true;

  const { field: conditionField, equals } = field.showWhen;
  return formState[conditionField] === equals;
}

/**
 * Process form data before submission
 * Converts types based on config field types
 * @param {Object} rawData - Raw form data
 * @param {Object} config - The game configuration
 * @returns {Object} Processed data ready for submission
 */
function processFormDataForSubmission(rawData, config) {
  const numericFields = getNumericFieldNames(config);
  const booleanFields = getBooleanFieldNames(config);
  const processed = { ...rawData };

  // Process numeric fields
  numericFields.forEach(fieldName => {
    if (processed[fieldName] !== undefined) {
      const value = processed[fieldName];
      if (value === '' || value === null) {
        processed[fieldName] = null;
      } else {
        const num = Number(value);
        processed[fieldName] = isNaN(num) ? null : num;
      }
    }
  });

  // Process boolean fields
  booleanFields.forEach(fieldName => {
    if (processed[fieldName] !== undefined) {
      processed[fieldName] = Boolean(processed[fieldName]);
    }
  });

  return processed;
}

/**
 * Get table layout information for rendering
 * @param {Object} tableField - A table field definition
 * @returns {Object} Layout information for rendering
 */
function getTableLayout(tableField) {
  if (!tableField || tableField.type !== 'table') return null;

  return {
    id: tableField.id,
    subHeader: tableField.subHeader,
    columns: tableField.columns || [],
    rows: tableField.rows?.map(row => ({
      label: row.label,
      fields: row.fields || [],
    })) || [],
  };
}

/**
 * Get collapsible section information
 * @param {Object} collapsibleField - A collapsible field definition
 * @returns {Object} Information for rendering collapsible section
 */
function getCollapsibleInfo(collapsibleField) {
  if (!collapsibleField || collapsibleField.type !== 'collapsible') return null;

  return {
    id: collapsibleField.id,
    trigger: collapsibleField.trigger,
    content: collapsibleField.content || [],
  };
}

/**
 * Find a section by ID
 * @param {Object} config - The game configuration
 * @param {string} sectionId - The section ID to find
 * @returns {Object|null} The section or null
 */
function findSection(config, sectionId) {
  if (!config.sections) return null;
  return config.sections.find(s => s.id === sectionId) || null;
}

/**
 * Get form title from config
 * @param {Object} config - The game configuration
 * @returns {string} Form title
 */
function getFormTitle(config) {
  return config.formTitle || config.displayName || 'Scouting Form';
}

export {
  getAllFields,
  getFormDefaults,
  getNumericFieldNames,
  getBooleanFieldNames,
  getTextFieldNames,
  getVisibleSections,
  getQualitativeFields,
  getCommentFields,
  getSingleSelectOptions,
  getCounterVariant,
  isFieldVisible,
  processFormDataForSubmission,
  getTableLayout,
  getCollapsibleInfo,
  findSection,
  getFormTitle,
};
