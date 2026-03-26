/**
 * Configuration Validator for Game Configurations
 * Validates JSON config structure before creating games
 */

// Valid field types
const VALID_FIELD_TYPES = [
  'checkbox',
  'counter',
  'number',
  'holdTimer',
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
    this.confidenceRatingCount = 0;
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

  // Validate isConfidenceRating uniqueness across all processed fields
  if (result.confidenceRatingCount > 1) {
    result.addError(
      `Only one starRating, qualitative, or checkbox field may have isConfidenceRating: true (found ${result.confidenceRatingCount})`,
      'isConfidenceRating'
    );
  }

  // Validate calculations (optional)
  if (config.calculations) {
    if (typeof config.calculations !== 'object') {
      result.addError('calculations must be an object', 'calculations');
    } else {
      validateCalculations(config.calculations, fieldNames, result);
    }
  }

  // Validate display (optional, warnings only)
  if (config.display) {
    if (typeof config.display !== 'object') {
      result.addError('display must be an object', 'display');
    } else {
      validateDisplaySection(config.display, fieldNames, result);
    }
  } else {
    result.addWarning('No display section defined - display pages will show a fallback message', 'display');
  }

  // Validate usePPR (optional boolean that enables the OPR Rankings sidebar)
  if (config.usePPR !== undefined) {
    if (typeof config.usePPR !== 'boolean') {
      result.addWarning('usePPR should be a boolean (true or false)', 'usePPR');
    } else if (config.usePPR === true) {
      const code = config.tbaEventCode;
      if (!code || typeof code !== 'string' || !code.trim()) {
        result.addWarning(
          'usePPR is true but tbaEventCode is missing or empty. The OPR Rankings sidebar requires a valid tbaEventCode.',
          'tbaEventCode'
        );
      }
    }
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

    case 'holdTimer':
      validateHoldTimerField(field, path, fieldNames, result);
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

  // Validate quickButtons (optional, for counter/number fields)
  if (field.quickButtons) {
    validateQuickButtons(field.quickButtons, path, result);
  }

  // Warn if isConfidenceRating is used on an unsupported field type
  if (field.isConfidenceRating === true && field.type !== 'starRating' && field.type !== 'qualitative' && field.type !== 'checkbox') {
    result.addWarning(
      'isConfidenceRating is only meaningful on starRating, qualitative, or checkbox fields',
      `${path}.isConfidenceRating`
    );
  }

  // Track color-controlling checkboxes
  if (field.isConfidenceRating === true && field.type === 'checkbox') {
    result.confidenceRatingCount++;
  }

  // Validate scoringRequirement (checkbox only)
  if (field.scoringRequirement !== undefined) {
    if (field.type !== 'checkbox') {
      result.addWarning(
        'scoringRequirement is only supported on checkbox fields and will be ignored',
        `${path}.scoringRequirement`
      );
    } else if (typeof field.scoringRequirement !== 'object' || field.scoringRequirement === null) {
      result.addError(
        'scoringRequirement must be an object with a requiredValue property',
        `${path}.scoringRequirement`
      );
    } else if (typeof field.scoringRequirement.requiredValue !== 'boolean') {
      result.addError(
        'scoringRequirement.requiredValue must be a boolean (true or false)',
        `${path}.scoringRequirement.requiredValue`
      );
    }
  }

  // invertColor is only meaningful on checkbox fields with isConfidenceRating
  if (field.invertColor !== undefined && field.type !== 'checkbox') {
    result.addWarning(
      'invertColor is only meaningful on checkbox fields with isConfidenceRating: true',
      `${path}.invertColor`
    );
  }
  if (field.invertColor !== undefined && typeof field.invertColor !== 'boolean') {
    result.addWarning('invertColor must be a boolean', `${path}.invertColor`);
  }
}

/**
 * Validate quickButtons configuration for counter/number fields
 */
function validateQuickButtons(quickButtons, path, result) {
  if (!Array.isArray(quickButtons)) {
    result.addError('quickButtons must be an array', `${path}.quickButtons`);
    return;
  }

  const seenValues = new Set();

  quickButtons.forEach((btn, index) => {
    const btnPath = `${path}.quickButtons[${index}]`;

    if (typeof btn.value !== 'number' || !Number.isInteger(btn.value)) {
      result.addError('Quick button value must be an integer', `${btnPath}.value`);
    }

    if (!btn.label || typeof btn.label !== 'string') {
      result.addError('Quick button label is required and must be a non-empty string', `${btnPath}.label`);
    }

    if (!btn.position || !['left', 'right'].includes(btn.position)) {
      result.addError('Quick button position must be "left" or "right"', `${btnPath}.position`);
    }

    if (btn.value !== undefined && seenValues.has(btn.value)) {
      result.addWarning(`Duplicate quick button value: ${btn.value}`, `${btnPath}.value`);
    }
    if (btn.value !== undefined) {
      seenValues.add(btn.value);
    }

    if (btn.style && typeof btn.style !== 'string') {
      result.addWarning('Quick button style should be a string', `${btnPath}.style`);
    }
  });
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

  // Track isConfidenceRating usage
  if (field.isConfidenceRating === true) {
    result.confidenceRatingCount++;
  }

  // Validate minWhenVisible
  if (field.minWhenVisible !== undefined) {
    if (typeof field.minWhenVisible !== 'number') {
      result.addWarning('starRating minWhenVisible should be a number', `${path}.minWhenVisible`);
    }
  }

  // Validate zeroLabel
  if (field.zeroLabel !== undefined && typeof field.zeroLabel !== 'string') {
    result.addWarning('starRating zeroLabel should be a string', `${path}.zeroLabel`);
  }

  // Validate ratingLabels
  if (field.ratingLabels !== undefined) {
    if (!Array.isArray(field.ratingLabels)) {
      result.addWarning('starRating ratingLabels should be an array of 6 strings', `${path}.ratingLabels`);
    } else if (field.ratingLabels.length !== 6) {
      result.addWarning(`starRating ratingLabels must have exactly 6 entries (found ${field.ratingLabels.length})`, `${path}.ratingLabels`);
    } else if (field.ratingLabels.some(l => typeof l !== 'string')) {
      result.addWarning('starRating ratingLabels entries must all be strings', `${path}.ratingLabels`);
    }
  }
}

/**
 * Validate a holdTimer field
 */
function validateHoldTimerField(field, path, fieldNames, result) {
  validateStandardField(field, path, fieldNames, result);

  if (field.buttonLabel !== undefined && typeof field.buttonLabel !== 'string') {
    result.addWarning('holdTimer buttonLabel should be a string', `${path}.buttonLabel`);
  }

  if (field.precision !== undefined) {
    if (!Number.isInteger(field.precision) || field.precision < 0 || field.precision > 4) {
      result.addWarning('holdTimer precision should be an integer between 0 and 4', `${path}.precision`);
    }
  }

  if (field.dbColumn?.type) {
    const dbType = field.dbColumn.type.toUpperCase();
    if (!dbType.startsWith('NUMERIC') && !dbType.startsWith('DECIMAL') && !dbType.startsWith('INTEGER')) {
      result.addWarning('holdTimer dbColumn.type should be NUMERIC, DECIMAL, or INTEGER', `${path}.dbColumn.type`);
    }
  }

  if (field.scoutLeads !== undefined) {
    if (!field.scoutLeads || typeof field.scoutLeads !== 'object' || Array.isArray(field.scoutLeads)) {
      result.addError('holdTimer scoutLeads must be an object', `${path}.scoutLeads`);
      return;
    }

    if (field.scoutLeads.rateLabel !== undefined && typeof field.scoutLeads.rateLabel !== 'string') {
      result.addWarning('holdTimer scoutLeads.rateLabel should be a string', `${path}.scoutLeads.rateLabel`);
    }

    if (field.scoutLeads.placeholder !== undefined && typeof field.scoutLeads.placeholder !== 'string') {
      result.addWarning('holdTimer scoutLeads.placeholder should be a string', `${path}.scoutLeads.placeholder`);
    }

    if (field.scoutLeads.defaultRate !== undefined && typeof field.scoutLeads.defaultRate !== 'number') {
      result.addWarning('holdTimer scoutLeads.defaultRate should be a number', `${path}.scoutLeads.defaultRate`);
    }

    if (field.scoutLeads.group !== undefined && typeof field.scoutLeads.group !== 'string') {
      result.addWarning('holdTimer scoutLeads.group should be a string', `${path}.scoutLeads.group`);
    }

    if (field.scoutLeads.groupLabel !== undefined && typeof field.scoutLeads.groupLabel !== 'string') {
      result.addWarning('holdTimer scoutLeads.groupLabel should be a string', `${path}.scoutLeads.groupLabel`);
    }

    if (field.scoutLeads.dbColumn !== undefined) {
      validateDbColumn(field.scoutLeads.dbColumn, `${path}.scoutLeads`, result);
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
 * Validate the display section of the config
 * Uses warnings only (not errors) since display is optional
 */
function validateDisplaySection(display, fieldNames, result) {
  const systemFields = new Set(['id', 'scoutname', 'scoutteam', 'team', 'match', 'matchtype', 'timestamp']);
  // Helper to check if a field name exists in the form config
  const checkField = (fieldName, path, options = {}) => {
    const { allowComputedPath = false } = options;
    if (allowComputedPath && typeof fieldName === 'string' && fieldName.includes('.')) {
      return;
    }
    if (fieldName && systemFields.has(fieldName.toLowerCase())) {
      return;
    }
    if (fieldName && !fieldNames.has(fieldName.toLowerCase())) {
      result.addError(`Display references unknown field: "${fieldName}"`, path);
    }
  };

  // Validate teamView
  if (display.teamView) {
    const tv = display.teamView;
    if (tv.piecePlacement?.bars) {
      tv.piecePlacement.bars.forEach((bar, i) => {
        if (bar.autoField) checkField(bar.autoField, `display.teamView.piecePlacement.bars[${i}].autoField`, { allowComputedPath: true });
        if (bar.teleField) checkField(bar.teleField, `display.teamView.piecePlacement.bars[${i}].teleField`, { allowComputedPath: true });
      });
    }
    // Validate metrics arrays on secondary stat groups (e.g. algae)
    const pp = tv.piecePlacement || {};
    Object.entries(pp).forEach(([groupName, groupConfig]) => {
      if (typeof groupConfig !== 'object' || groupName === 'bars' || groupName === 'coral') return;
      if (groupConfig.metrics && Array.isArray(groupConfig.metrics)) {
        groupConfig.metrics.forEach((metric, mi) => {
          const mPath = `display.teamView.piecePlacement.${groupName}.metrics[${mi}]`;
          if (!metric.key) result.addWarning('Metric is missing "key"', mPath);
          if (!metric.type || !['successFail', 'count'].includes(metric.type)) {
            result.addWarning(`Metric type must be "successFail" or "count"`, `${mPath}.type`);
          }
          if (metric.fieldIndex === undefined) result.addWarning('Metric is missing "fieldIndex"', mPath);
          if (metric.type === 'successFail' && metric.failIndex === undefined) {
            result.addWarning('successFail metric is missing "failIndex"', mPath);
          }
          // Check that fieldIndex is within bounds
          const fields = groupConfig.autoFields || groupConfig.teleFields || [];
          if (typeof metric.fieldIndex === 'number' && metric.fieldIndex >= fields.length) {
            result.addWarning(`Metric fieldIndex ${metric.fieldIndex} is out of bounds (${fields.length} fields)`, mPath);
          }
        });
      }
    });

    if (tv.endgamePie?.field) {
      checkField(tv.endgamePie.field, 'display.teamView.endgamePie.field');
    }
    if (tv.comments) {
      tv.comments.forEach((c, i) => checkField(c, `display.teamView.comments[${i}]`));
    }
    // Validate commentFields structure
    if (tv.commentFields) {
      if (!Array.isArray(tv.commentFields)) {
        result.addWarning('commentFields must be an array', 'display.teamView.commentFields');
      } else {
        tv.commentFields.forEach((cf, i) => {
          const cfPath = `display.teamView.commentFields[${i}]`;
          if (!cf.field) result.addWarning('commentField is missing "field"', cfPath);
          if (!cf.dataKey) result.addWarning('commentField is missing "dataKey"', cfPath);
          if (!cf.title) result.addWarning('commentField is missing "title"', cfPath);
          if (cf.field) checkField(cf.field, `${cfPath}.field`);
        });
      }
    }
    if (tv.defenseBarField) {
      checkField(tv.defenseBarField, 'display.teamView.defenseBarField');
    }
  }

  // Validate matchView
  if (display.matchView) {
    const mv = display.matchView;
    if (!mv.piecePlacement?.bars || !Array.isArray(mv.piecePlacement.bars) || mv.piecePlacement.bars.length === 0) {
      result.addWarning('matchView.piecePlacement.bars should be a non-empty array', 'display.matchView.piecePlacement.bars');
    }
    if (!mv.endgamePie?.labels || !Array.isArray(mv.endgamePie.labels) || mv.endgamePie.labels.length === 0) {
      result.addWarning('matchView.endgamePie.labels should be a non-empty array', 'display.matchView.endgamePie.labels');
    }
    if (!mv.endgamePie?.keys || !Array.isArray(mv.endgamePie.keys) || mv.endgamePie.keys.length === 0) {
      result.addWarning('matchView.endgamePie.keys should be a non-empty array', 'display.matchView.endgamePie.keys');
    }
    if (Array.isArray(mv.endgamePie?.labels) && Array.isArray(mv.endgamePie?.keys) && mv.endgamePie.labels.length !== mv.endgamePie.keys.length) {
      result.addWarning('matchView.endgamePie.labels and keys should have the same length', 'display.matchView.endgamePie');
    }
    if (mv.qualitativeFields) {
      mv.qualitativeFields.forEach((f, i) => checkField(f, `display.matchView.qualitativeFields[${i}]`));
    }
    if (mv.defenseBarField) {
      checkField(mv.defenseBarField, 'display.matchView.defenseBarField');
    }
    // Validate ranking point field references
    if (mv.rankingPoints && Array.isArray(mv.rankingPoints)) {
      mv.rankingPoints.forEach((rp, i) => {
        const rpPath = `display.matchView.rankingPoints[${i}]`;
        if (rp.leaveField) checkField(rp.leaveField, `${rpPath}.leaveField`);
        if (rp.coralFields) {
          rp.coralFields.forEach((f, fi) => checkField(f, `${rpPath}.coralFields[${fi}]`));
        }
      });
    }
  }

  // Validate picklist
  if (display.picklist) {
    if (display.picklist.defenseField) {
      checkField(display.picklist.defenseField, 'display.picklist.defenseField');
    }
    // Validate scatter plot field references
    if (display.picklist.scatterPlot) {
      const sp = display.picklist.scatterPlot;
      if (sp.xAxis?.fields) {
        sp.xAxis.fields.forEach((f, i) => checkField(f, `display.picklist.scatterPlot.xAxis.fields[${i}]`));
      }
      if (sp.yAxis?.fields) {
        sp.yAxis.fields.forEach((f, i) => checkField(f, `display.picklist.scatterPlot.yAxis.fields[${i}]`));
      }
    }
  }

  // Validate apiAggregation
  if (display.apiAggregation) {
    const api = display.apiAggregation;
    if (api.booleanFields) {
      api.booleanFields.forEach((f, i) => checkField(f, `display.apiAggregation.booleanFields[${i}]`));
    }
    if (api.textFields) {
      api.textFields.forEach((f, i) => checkField(f, `display.apiAggregation.textFields[${i}]`));
    }
    if (api.qualitativeFields) {
      api.qualitativeFields.forEach((f, i) => checkField(f, `display.apiAggregation.qualitativeFields[${i}]`));
    }
    // Validate breakdownField / defenseField
    if (api.breakdownField) checkField(api.breakdownField, 'display.apiAggregation.breakdownField');
    if (api.defenseField) checkField(api.defenseField, 'display.apiAggregation.defenseField');
    // Validate alliance piece placement field references
    if (api.alliancePiecePlacement && Array.isArray(api.alliancePiecePlacement)) {
      api.alliancePiecePlacement.forEach((entry, i) => {
        const entryPath = `display.apiAggregation.alliancePiecePlacement[${i}]`;
        if (!entry.key) result.addWarning('alliancePiecePlacement entry is missing "key"', `${entryPath}.key`);
        if (!entry.fields || !Array.isArray(entry.fields) || entry.fields.length === 0) {
          result.addWarning('alliancePiecePlacement entry should define a non-empty fields array', `${entryPath}.fields`);
        } else {
          entry.fields.forEach((f, fi) => checkField(f, `${entryPath}.fields[${fi}]`));
        }
      });
    }
    // Validate successFailPairs
    if (api.successFailPairs && Array.isArray(api.successFailPairs)) {
      api.successFailPairs.forEach((pair, i) => {
        const pPath = `display.apiAggregation.successFailPairs[${i}]`;
        if (!pair.key) result.addWarning('successFailPair is missing "key"', pPath);
        if (!pair.phase || !['auto', 'tele'].includes(pair.phase)) {
          result.addWarning('successFailPair phase must be "auto" or "tele"', `${pPath}.phase`);
        }
        if (pair.successField) checkField(pair.successField, `${pPath}.successField`);
        if (pair.failField) checkField(pair.failField, `${pPath}.failField`);
      });
    }
  }
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
