/**
 * Calculation Engine for Dynamic EPA Calculations
 * Parses and executes EPA formulas from game configuration
 */

/**
 * Create calculation functions from a game config
 * @param {Object} config - The game configuration with calculations section
 * @returns {Object} Object with calcAuto, calcTele, calcEnd, calcEPA functions
 */
function createCalculationFunctions(config) {
  const calculations = config?.calculations || {};

  // Default calculation functions (return 0 if not configured)
  let calcAuto = () => 0;
  let calcTele = () => 0;
  let calcEnd = () => 0;

  // Create auto calculation if defined
  if (calculations.auto) {
    calcAuto = createCalculationFunction(calculations.auto);
  }

  // Create tele calculation if defined
  if (calculations.tele) {
    calcTele = createCalculationFunction(calculations.tele);
  }

  // Create end calculation if defined
  if (calculations.end) {
    calcEnd = createCalculationFunction(calculations.end);
  }

  // Create combined EPA function
  const calcEPA = (record) => {
    return calcAuto(record) + calcTele(record) + calcEnd(record);
  };

  return {
    calcAuto,
    calcTele,
    calcEnd,
    calcEPA,
    calculations,
  };
}

/**
 * Create a single calculation function from a calculation config
 * @param {Object} calcConfig - The calculation configuration
 * @returns {Function} A function that takes a record and returns a number
 */
function createCalculationFunction(calcConfig) {
  if (!calcConfig) {
    return () => 0;
  }

  // Handle mapping-based calculations
  if (calcConfig.type === 'mapping') {
    return createMappingCalculation(calcConfig);
  }

  // Handle formula-based calculations
  if (calcConfig.formula) {
    return createFormulaCalculation(calcConfig);
  }

  // Handle sum-based calculations
  if (calcConfig.sum) {
    return createSumCalculation(calcConfig);
  }

  // Handle weighted sum calculations
  if (calcConfig.weighted) {
    return createWeightedCalculation(calcConfig);
  }

  return () => 0;
}

/**
 * Create a mapping-based calculation function
 * @param {Object} calcConfig - Config with field and mapping
 * @returns {Function} Calculation function
 */
function createMappingCalculation(calcConfig) {
  const { field, mapping } = calcConfig;

  return (record) => {
    const value = record[field];
    if (value === undefined || value === null) {
      return 0;
    }

    const roundedValue = Math.round(value);
    const mapped = mapping[roundedValue.toString()];
    return mapped !== undefined ? mapped : 0;
  };
}

/**
 * Create a formula-based calculation function
 * Supports basic arithmetic with field references
 * @param {Object} calcConfig - Config with formula string
 * @returns {Function} Calculation function
 */
function createFormulaCalculation(calcConfig) {
  const { formula, fields = [] } = calcConfig;

  return (record) => {
    try {
      // Replace field references with actual values
      let expression = formula;

      // Sort fields by length (longest first) to avoid partial replacements
      const sortedFields = [...fields].sort((a, b) => b.length - a.length);

      for (const fieldName of sortedFields) {
        const value = record[fieldName];
        let numValue;

        if (typeof value === 'boolean') {
          numValue = value ? 1 : 0;
        } else if (value === null || value === undefined) {
          numValue = 0;
        } else {
          numValue = Number(value) || 0;
        }

        // Replace all occurrences of the field name
        const regex = new RegExp(`\\b${escapeRegex(fieldName)}\\b`, 'g');
        expression = expression.replace(regex, numValue.toString());
      }

      // Handle equality ternary expressions (e.g., "(autoclimb==1?15:0)")
      // Must run BEFORE the simple boolean ternary so the == isn't stripped first.
      expression = expression.replace(
        /\((-?\d+(?:\.\d+)?)==(-?\d+(?:\.\d+)?)\?(-?\d+(?:\.\d+)?):(-?\d+(?:\.\d+)?)\)/g,
        (_, lhs, rhs, ifTrue, ifFalse) => (parseFloat(lhs) === parseFloat(rhs) ? ifTrue : ifFalse)
      );

      // Handle boolean ternary expressions (e.g., "(leave?3:0)")
      expression = expression.replace(/\((\d+)\?(\d+):(\d+)\)/g, (_, cond, ifTrue, ifFalse) => {
        return parseInt(cond) ? ifTrue : ifFalse;
      });

      // Evaluate the expression safely
      return safeEval(expression);
    } catch (e) {
      console.error('Formula evaluation error:', e, 'Formula:', formula);
      return 0;
    }
  };
}

/**
 * Create a sum-based calculation function
 * @param {Object} calcConfig - Config with sum array of field names
 * @returns {Function} Calculation function
 */
function createSumCalculation(calcConfig) {
  const { sum } = calcConfig;

  return (record) => {
    return sum.reduce((total, fieldName) => {
      const value = record[fieldName];
      if (typeof value === 'number' && !isNaN(value)) {
        return total + value;
      }
      return total;
    }, 0);
  };
}

/**
 * Create a weighted sum calculation function
 * @param {Object} calcConfig - Config with weighted array of {field, weight} objects
 * @returns {Function} Calculation function
 */
function createWeightedCalculation(calcConfig) {
  const { weighted } = calcConfig;

  return (record) => {
    return weighted.reduce((total, item) => {
      const value = record[item.field];
      let numValue;

      if (typeof value === 'boolean') {
        numValue = value ? 1 : 0;
      } else if (value === null || value === undefined) {
        numValue = 0;
      } else {
        numValue = Number(value) || 0;
      }

      return total + (numValue * item.weight);
    }, 0);
  };
}

/**
 * Safely evaluate a mathematical expression
 * Only allows basic arithmetic operations
 * @param {string} expression - Mathematical expression to evaluate
 * @returns {number} Result of the evaluation
 */
function safeEval(expression) {
  // Allow numbers, arithmetic operators, parentheses, and comparison/ternary operators
  const sanitized = expression.replace(/[^0-9+\-*/().?\s:=!<>]/g, '');

  // Handle ternary expressions
  let expr = sanitized.replace(/(\d+)\?(\d+):(\d+)/g, (_, cond, ifTrue, ifFalse) => {
    return parseInt(cond) ? ifTrue : ifFalse;
  });

  // Basic security check
  if (/[a-zA-Z_]/.test(expr)) {
    console.error('Invalid characters in expression:', expr);
    return 0;
  }

  try {
    // Use Function constructor for safer eval
    const fn = new Function(`return ${expr}`);
    const result = fn();
    return typeof result === 'number' && !isNaN(result) ? result : 0;
  } catch (e) {
    console.error('Safe eval error:', e);
    return 0;
  }
}

/**
 * Escape special regex characters in a string
 * @param {string} string - String to escape
 * @returns {string} Escaped string
 */
function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Get all fields referenced in calculations
 * @param {Object} calculations - The calculations config object
 * @returns {Set} Set of field names used in calculations
 */
function getCalculationFields(calculations) {
  const fields = new Set();

  Object.values(calculations).forEach(calc => {
    if (calc.fields) {
      calc.fields.forEach(f => fields.add(f));
    }
    if (calc.field) {
      fields.add(calc.field);
    }
    if (calc.sum) {
      calc.sum.forEach(f => fields.add(f));
    }
    if (calc.weighted) {
      calc.weighted.forEach(item => fields.add(item.field));
    }
  });

  return fields;
}

/**
 * Pre-built calculation templates for common FRC scoring patterns
 */
const calculationTemplates = {
  // Simple point assignment
  pointsPerItem: (field, points) => ({
    formula: `${field} * ${points}`,
    fields: [field],
  }),

  // Success/fail counter
  successCounter: (successField, points) => ({
    formula: `${successField} * ${points}`,
    fields: [successField],
  }),

  // Boolean bonus
  booleanBonus: (field, points) => ({
    formula: `(${field}?${points}:0)`,
    fields: [field],
  }),

  // Endgame mapping (common pattern)
  endgameMapping: (field, mappings) => ({
    type: 'mapping',
    field,
    mapping: mappings,
  }),
};

/**
 * Validate that a calculation config is properly formed
 * @param {Object} calcConfig - The calculation config to validate
 * @returns {Object} { valid: boolean, errors: string[] }
 */
function validateCalculation(calcConfig) {
  const errors = [];

  if (!calcConfig || typeof calcConfig !== 'object') {
    errors.push('Calculation config must be an object');
    return { valid: false, errors };
  }

  if (calcConfig.type === 'mapping') {
    if (!calcConfig.field) {
      errors.push('Mapping calculation requires a field');
    }
    if (!calcConfig.mapping || typeof calcConfig.mapping !== 'object') {
      errors.push('Mapping calculation requires a mapping object');
    }
  } else if (calcConfig.formula) {
    if (typeof calcConfig.formula !== 'string') {
      errors.push('Formula must be a string');
    }
    if (calcConfig.fields && !Array.isArray(calcConfig.fields)) {
      errors.push('Fields must be an array');
    }
  } else if (calcConfig.sum) {
    if (!Array.isArray(calcConfig.sum)) {
      errors.push('Sum must be an array of field names');
    }
  } else if (calcConfig.weighted) {
    if (!Array.isArray(calcConfig.weighted)) {
      errors.push('Weighted must be an array');
    } else {
      calcConfig.weighted.forEach((item, i) => {
        if (!item.field) {
          errors.push(`Weighted item ${i} requires a field`);
        }
        if (typeof item.weight !== 'number') {
          errors.push(`Weighted item ${i} requires a numeric weight`);
        }
      });
    }
  } else {
    errors.push('Calculation must have formula, mapping type, sum, or weighted');
  }

  return { valid: errors.length === 0, errors };
}

export {
  createCalculationFunctions,
  createCalculationFunction,
  createMappingCalculation,
  createFormulaCalculation,
  createSumCalculation,
  createWeightedCalculation,
  safeEval,
  getCalculationFields,
  calculationTemplates,
  validateCalculation,
};
