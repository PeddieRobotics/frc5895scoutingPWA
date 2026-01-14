/**
 * Configuration Validator for Game Configurations
 * Validates JSON config structure before creating games
 */

// Valid field types
const VALID_FIELD_TYPES = [
  'checkbox',
  'counter',
  'number',
  'text',
  'comment',
  'singleSelect',
  'multiSelect',
  'starRating',
  'qualitative',
  'table',
  'collapsible',
];

// Reserved field names that cannot be used
const RESERVED_FIELD_NAMES = [
  'id',
  'scoutname',
  'scoutteam',
  'team',
  'match',
  'matchtype',
  'timestamp',
];

/**
 * Validation result class
 */
class ValidationResult {
  constructor() {
    this.valid = true;
    this.errors = [];
    this.warnings = [];
    this.fields = [];
  }

  addError(message, path = null) {
    this.valid = false;
    this.errors.push({ message, path });
  }

  addWarning(message, path = null) {
    this.warnings.push({ message, path });
  }

  addField(field) {
    this.fields.push(field);
  }
}

/**
 * Validate a complete game configuration
 * @param {Object} config - The game configuration object
 * @returns {ValidationResult} Validation result with errors, warnings, and extracted fields
 */
function validateConfig(config) {
  const result = new ValidationResult();

  // Check required top-level fields
  if (!config) {
    result.addError('Configuration is empty or null');
    return result;
  }

  if (typeof config !== 'object') {
    result.addError('Configuration must be an object');
    return result;
  }

  // Validate gameName
  if (!config.gameName) {
    result.addError('gameName is required', 'gameName');
  } else if (typeof config.gameName !== 'string') {
    result.addError('gameName must be a string', 'gameName');
  } else if (config.gameName.length < 3) {
    result.addError('gameName must be at least 3 characters', 'gameName');
  } else if (config.gameName.length > 100) {
    result.addError('gameName must be at most 100 characters', 'gameName');
  } else if (!/^[a-zA-Z0-9_\-\s]+$/.test(config.gameName)) {
    result.addError('gameName can only contain letters, numbers, underscores, hyphens, and spaces', 'gameName');
  }

  // Validate displayName
  if (!config.displayName) {
    result.addError('displayName is required', 'displayName');
  } else if (typeof config.displayName !== 'string') {
    result.addError('displayName must be a string', 'displayName');
  } else if (config.displayName.length > 200) {
    result.addError('displayName must be at most 200 characters', 'displayName');
  }

  // Validate formTitle (optional)
  if (config.formTitle && typeof config.formTitle !== 'string') {
    result.addError('formTitle must be a string', 'formTitle');
  }

  // Validate version (optional)
  if (config.version && typeof config.version !== 'string') {
    result.addWarning('version should be a string', 'version');
  }

  // Track field names to detect duplicates
  const fieldNames = new Set();

  // Validate basics section
  if (config.basics) {
    if (typeof config.basics !== 'object') {
      result.addError('basics must be an object', 'basics');
    } else if (config.basics.fields) {
      if (!Array.isArray(config.basics.fields)) {
        result.addError('basics.fields must be an array', 'basics.fields');
      } else {
        config.basics.fields.forEach((field, index) => {
          validateField(field, `basics.fields[${index}]`, fieldNames, result);
        });
      }
    }
  }

  // Validate sections
  if (!config.sections) {
    result.addWarning('No sections defined - form will be empty', 'sections');
  } else if (!Array.isArray(config.sections)) {
    result.addError('sections must be an array', 'sections');
  } else if (config.sections.length === 0) {
    result.addWarning('sections array is empty - form will be empty', 'sections');
  } else {
    config.sections.forEach((section, sIndex) => {
      validateSection(section, `sections[${sIndex}]`, fieldNames, result);
    });
  }

  // Validate calculations (optional)
  if (config.calculations) {
    if (typeof config.calculations !== 'object') {
      result.addError('calculations must be an object', 'calculations');
    } else {
      validateCalculations(config.calculations, fieldNames, result);
    }
  }

  // Validate display (optional)
  if (config.display) {
    if (typeof config.display !== 'object') {
      result.addError('display must be an object', 'display');
    }
    // Further display validation can be added here
  }

  return result;
}

/**
 * Validate a section definition
 * @param {Object} section - Section definition
 * @param {string} path - Path for error reporting
 * @param {Set} fieldNames - Set of field names for duplicate detection
 * @param {ValidationResult} result - Validation result to add errors/warnings
 */
function validateSection(section, path, fieldNames, result) {
  if (!section || typeof section !== 'object') {
    result.addError('Section must be an object', path);
    return;
  }

  // Validate id (optional but recommended)
  if (section.id && typeof section.id !== 'string') {
    result.addWarning('Section id should be a string', `${path}.id`);
  }

  // Validate header
  if (!section.header) {
    result.addWarning('Section is missing a header', `${path}.header`);
  } else if (typeof section.header !== 'string') {
    result.addError('Section header must be a string', `${path}.header`);
  }

  // Validate showWhen (optional)
  if (section.showWhen) {
    if (typeof section.showWhen !== 'object') {
      result.addError('showWhen must be an object', `${path}.showWhen`);
    } else {
      if (!section.showWhen.field) {
        result.addError('showWhen.field is required', `${path}.showWhen.field`);
      }
      if (section.showWhen.equals === undefined) {
        result.addError('showWhen.equals is required', `${path}.showWhen.equals`);
      }
    }
  }

  // Validate fields
  if (!section.fields) {
    result.addWarning('Section has no fields', `${path}.fields`);
  } else if (!Array.isArray(section.fields)) {
    result.addError('Section fields must be an array', `${path}.fields`);
  } else {
    section.fields.forEach((field, index) => {
      validateField(field, `${path}.fields[${index}]`, fieldNames, result);
    });
  }
}

/**
 * Validate a field definition
 * @param {Object} field - Field definition
 * @param {string} path - Path for error reporting
 * @param {Set} fieldNames - Set of field names for duplicate detection
 * @param {ValidationResult} result - Validation result to add errors/warnings
 */
function validateField(field, path, fieldNames, result) {
  if (!field || typeof field !== 'object') {
    result.addError('Field must be an object', path);
    return;
  }

  // Validate type
  if (!field.type) {
    result.addError('Field type is required', `${path}.type`);
    return;
  }

  if (!VALID_FIELD_TYPES.includes(field.type)) {
    result.addError(`Invalid field type: ${field.type}. Valid types are: ${VALID_FIELD_TYPES.join(', ')}`, `${path}.type`);
    return;
  }

  // Special handling for different field types
  switch (field.type) {
    case 'table':
      validateTableField(field, path, fieldNames, result);
      break;

    case 'collapsible':
      validateCollapsibleField(field, path, fieldNames, result);
      break;

    case 'singleSelect':
      validateSingleSelectField(field, path, fieldNames, result);
      break;

    case 'multiSelect':
      validateMultiSelectField(field, path, fieldNames, result);
      break;

    case 'starRating':
    case 'qualitative':
      validateStarRatingField(field, path, fieldNames, result);
      break;

    default:
      // Standard field validation
      validateStandardField(field, path, fieldNames, result);
  }
}

/**
 * Validate a standard field (checkbox, counter, number, text, comment)
 */
function validateStandardField(field, path, fieldNames, result) {
  // Validate name
  if (!field.name) {
    result.addError('Field name is required', `${path}.name`);
    return;
  }

  if (typeof field.name !== 'string') {
    result.addError('Field name must be a string', `${path}.name`);
    return;
  }

  // Check for reserved names
  if (RESERVED_FIELD_NAMES.includes(field.name.toLowerCase())) {
    result.addError(`Field name "${field.name}" is reserved`, `${path}.name`);
    return;
  }

  // Check for duplicates
  if (fieldNames.has(field.name.toLowerCase())) {
    result.addError(`Duplicate field name: ${field.name}`, `${path}.name`);
    return;
  }

  fieldNames.add(field.name.toLowerCase());

  // Add to result fields list
  result.addField({
    name: field.name,
    type: field.type,
    label: field.label || field.name,
    path,
  });

  // Validate label (optional)
  if (field.label && typeof field.label !== 'string') {
    result.addWarning('Field label should be a string', `${path}.label`);
  }

  // Validate dbColumn (optional)
  if (field.dbColumn) {
    validateDbColumn(field.dbColumn, path, result);
  }
}

/**
 * Validate a table field
 */
function validateTableField(field, path, fieldNames, result) {
  if (!field.rows) {
    result.addError('Table field requires rows', `${path}.rows`);
    return;
  }

  if (!Array.isArray(field.rows)) {
    result.addError('Table rows must be an array', `${path}.rows`);
    return;
  }

  field.rows.forEach((row, rowIndex) => {
    if (!row.fields) {
      result.addWarning(`Table row ${rowIndex} has no fields`, `${path}.rows[${rowIndex}]`);
    } else if (!Array.isArray(row.fields)) {
      result.addError(`Table row ${rowIndex} fields must be an array`, `${path}.rows[${rowIndex}].fields`);
    } else {
      row.fields.forEach((f, fIndex) => {
        validateField(f, `${path}.rows[${rowIndex}].fields[${fIndex}]`, fieldNames, result);
      });
    }
  });
}

/**
 * Validate a collapsible field
 */
function validateCollapsibleField(field, path, fieldNames, result) {
  // Validate trigger
  if (!field.trigger) {
    result.addError('Collapsible field requires a trigger', `${path}.trigger`);
  } else {
    validateField(field.trigger, `${path}.trigger`, fieldNames, result);
  }

  // Validate content
  if (!field.content) {
    result.addWarning('Collapsible field has no content', `${path}.content`);
  } else if (!Array.isArray(field.content)) {
    result.addError('Collapsible content must be an array', `${path}.content`);
  } else {
    field.content.forEach((f, index) => {
      validateField(f, `${path}.content[${index}]`, fieldNames, result);
    });
  }
}

/**
 * Validate a singleSelect field
 */
function validateSingleSelectField(field, path, fieldNames, result) {
  // Validate name
  if (!field.name) {
    result.addError('SingleSelect field name is required', `${path}.name`);
    return;
  }

  if (typeof field.name !== 'string') {
    result.addError('SingleSelect field name must be a string', `${path}.name`);
    return;
  }

  // Check for duplicates
  if (fieldNames.has(field.name.toLowerCase())) {
    result.addError(`Duplicate field name: ${field.name}`, `${path}.name`);
    return;
  }

  fieldNames.add(field.name.toLowerCase());

  // Validate options
  if (!field.options) {
    result.addError('SingleSelect field requires options', `${path}.options`);
    return;
  }

  if (!Array.isArray(field.options)) {
    result.addError('SingleSelect options must be an array', `${path}.options`);
    return;
  }

  if (field.options.length === 0) {
    result.addWarning('SingleSelect has no options', `${path}.options`);
  }

  let hasDefault = false;
  field.options.forEach((opt, index) => {
    if (opt.value === undefined) {
      result.addError(`Option ${index} is missing a value`, `${path}.options[${index}].value`);
    }
    if (!opt.label) {
      result.addWarning(`Option ${index} is missing a label`, `${path}.options[${index}].label`);
    }
    if (opt.default) {
      hasDefault = true;
    }
  });

  if (!hasDefault) {
    result.addWarning('SingleSelect has no default option', `${path}.options`);
  }

  result.addField({
    name: field.name,
    type: field.type,
    label: field.label || field.name,
    path,
  });
}

/**
 * Validate a multiSelect field
 */
function validateMultiSelectField(field, path, fieldNames, result) {
  // Validate options
  if (!field.options) {
    result.addError('MultiSelect field requires options', `${path}.options`);
    return;
  }

  if (!Array.isArray(field.options)) {
    result.addError('MultiSelect options must be an array', `${path}.options`);
    return;
  }

  if (field.options.length === 0) {
    result.addWarning('MultiSelect has no options', `${path}.options`);
  }

  field.options.forEach((opt, index) => {
    if (!opt.name) {
      result.addError(`Option ${index} is missing a name`, `${path}.options[${index}].name`);
      return;
    }

    // Check for duplicates
    if (fieldNames.has(opt.name.toLowerCase())) {
      result.addError(`Duplicate field name: ${opt.name}`, `${path}.options[${index}].name`);
      return;
    }

    fieldNames.add(opt.name.toLowerCase());

    if (!opt.label) {
      result.addWarning(`Option ${index} is missing a label`, `${path}.options[${index}].label`);
    }

    result.addField({
      name: opt.name,
      type: 'checkbox',
      label: opt.label || opt.name,
      path: `${path}.options[${index}]`,
    });
  });
}

/**
 * Validate a starRating field
 */
function validateStarRatingField(field, path, fieldNames, result) {
  validateStandardField(field, path, fieldNames, result);

  // Validate max
  if (field.max !== undefined) {
    if (typeof field.max !== 'number' || field.max < 1 || field.max > 10) {
      result.addWarning('starRating max should be a number between 1 and 10', `${path}.max`);
    }
  }

  // Validate minWhenVisible
  if (field.minWhenVisible !== undefined) {
    if (typeof field.minWhenVisible !== 'number') {
      result.addWarning('starRating minWhenVisible should be a number', `${path}.minWhenVisible`);
    }
  }
}

/**
 * Validate dbColumn definition
 */
function validateDbColumn(dbColumn, path, result) {
  if (typeof dbColumn !== 'object') {
    result.addError('dbColumn must be an object', `${path}.dbColumn`);
    return;
  }

  // Validate type
  if (dbColumn.type) {
    const validTypes = ['BOOLEAN', 'INTEGER', 'TEXT', 'VARCHAR', 'NUMERIC', 'DECIMAL', 'TIMESTAMP'];
    const typeUpper = dbColumn.type.toUpperCase();
    const isValid = validTypes.some(t => typeUpper.startsWith(t));
    if (!isValid) {
      result.addWarning(`Unusual database type: ${dbColumn.type}`, `${path}.dbColumn.type`);
    }
  }
}

/**
 * Validate calculations configuration
 */
function validateCalculations(calculations, fieldNames, result) {
  Object.entries(calculations).forEach(([name, calc]) => {
    if (!calc || typeof calc !== 'object') {
      result.addError(`Calculation "${name}" must be an object`, `calculations.${name}`);
      return;
    }

    if (calc.formula) {
      // Formula-based calculation
      if (typeof calc.formula !== 'string') {
        result.addError(`Calculation "${name}" formula must be a string`, `calculations.${name}.formula`);
      }

      if (calc.fields) {
        if (!Array.isArray(calc.fields)) {
          result.addWarning(`Calculation "${name}" fields should be an array`, `calculations.${name}.fields`);
        } else {
          // Check that referenced fields exist
          calc.fields.forEach(f => {
            if (!fieldNames.has(f.toLowerCase()) && !['leave', 'noshow'].includes(f.toLowerCase())) {
              result.addWarning(`Calculation "${name}" references unknown field: ${f}`, `calculations.${name}.fields`);
            }
          });
        }
      }
    } else if (calc.type === 'mapping') {
      // Mapping-based calculation
      if (!calc.field) {
        result.addError(`Mapping calculation "${name}" requires a field`, `calculations.${name}.field`);
      }
      if (!calc.mapping || typeof calc.mapping !== 'object') {
        result.addError(`Mapping calculation "${name}" requires a mapping object`, `calculations.${name}.mapping`);
      }
    }
  });
}

/**
 * Quick validation check - returns true/false without detailed errors
 * @param {Object} config - The game configuration
 * @returns {boolean} Whether the config is valid
 */
function isValidConfig(config) {
  const result = validateConfig(config);
  return result.valid;
}

/**
 * Parse and validate a JSON string
 * @param {string} jsonString - JSON string to parse and validate
 * @returns {ValidationResult} Validation result
 */
function parseAndValidateConfig(jsonString) {
  const result = new ValidationResult();

  if (!jsonString || typeof jsonString !== 'string') {
    result.addError('JSON string is required');
    return result;
  }

  let config;
  try {
    config = JSON.parse(jsonString);
  } catch (e) {
    result.addError(`Invalid JSON: ${e.message}`);
    return result;
  }

  return validateConfig(config);
}

export {
  validateConfig,
  isValidConfig,
  parseAndValidateConfig,
  ValidationResult,
  VALID_FIELD_TYPES,
  RESERVED_FIELD_NAMES,
};
