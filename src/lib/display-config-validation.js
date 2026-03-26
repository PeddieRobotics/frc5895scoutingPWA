import { getAllFields } from "./form-renderer.js";

function getFieldSet(config) {
  const fieldSet = new Set();
  const systemFields = ['id', 'scoutname', 'scoutteam', 'team', 'match', 'matchtype', 'timestamp'];

  try {
    getAllFields(config).forEach((field) => {
      if (field?.name) {
        fieldSet.add(String(field.name).toLowerCase());
      }
    });
  } catch (_) {
    // Ignore extraction errors and return what we collected.
  }

  systemFields.forEach((fieldName) => fieldSet.add(fieldName));

  return fieldSet;
}

function addIssue(issues, path, message) {
  issues.push({ path, message });
}

function validateFieldRef(issues, fieldSet, path, value, { allowComputedPath = false } = {}) {
  if (!value || typeof value !== "string") {
    addIssue(issues, path, "must be a non-empty string");
    return;
  }

  if (allowComputedPath && value.includes(".")) {
    return;
  }

  if (!fieldSet.has(value.toLowerCase())) {
    addIssue(issues, path, `references unknown form field "${value}"`);
  }
}

export function getTeamViewConfigIssues(config) {
  const issues = [];
  const display = config?.display;
  const teamView = display?.teamView;
  const fieldSet = getFieldSet(config);

  if (!teamView || typeof teamView !== "object") {
    addIssue(issues, "display.teamView", "is missing");
    return issues;
  }

  const bars = teamView.piecePlacement?.bars;
  // piecePlacement is optional — only validate contents when bars are present
  if (Array.isArray(bars) && bars.length > 0) {
    bars.forEach((bar, index) => {
      const base = `display.teamView.piecePlacement.bars[${index}]`;
      if (!bar || typeof bar !== "object") {
        addIssue(issues, base, "must be an object");
        return;
      }
      if (!bar.label) {
        addIssue(issues, `${base}.label`, "is required");
      }
      if (!bar.autoField && !bar.teleField) {
        addIssue(issues, base, "must define at least one of autoField or teleField");
      }
      if (bar.autoField) {
        validateFieldRef(issues, fieldSet, `${base}.autoField`, bar.autoField, { allowComputedPath: true });
      }
      if (bar.teleField) {
        validateFieldRef(issues, fieldSet, `${base}.teleField`, bar.teleField, { allowComputedPath: true });
      }
    });
  }

  const labels = teamView.endgamePie?.labels;
  const values = teamView.endgamePie?.values;
  if (!Array.isArray(labels) || labels.length === 0) {
    addIssue(issues, "display.teamView.endgamePie.labels", "must be a non-empty array");
  }
  if (!Array.isArray(values) || values.length === 0) {
    addIssue(issues, "display.teamView.endgamePie.values", "must be a non-empty array");
  } else if (Array.isArray(labels) && labels.length !== values.length) {
    addIssue(issues, "display.teamView.endgamePie", "labels and values must have the same length");
  }

  const endgameMapping = display?.apiAggregation?.endgameConfig?.valueMapping;
  if (!endgameMapping || typeof endgameMapping !== "object") {
    addIssue(
      issues,
      "display.apiAggregation.endgameConfig.valueMapping",
      "is required for team-view endgame distribution"
    );
  } else if (Array.isArray(values)) {
    values.forEach((value, index) => {
      if (endgameMapping[String(value)] === undefined) {
        addIssue(
          issues,
          `display.teamView.endgamePie.values[${index}]`,
          `value "${value}" has no mapping in display.apiAggregation.endgameConfig.valueMapping`
        );
      }
    });
  }

  if (teamView.commentFields) {
    if (!Array.isArray(teamView.commentFields) || teamView.commentFields.length === 0) {
      addIssue(issues, "display.teamView.commentFields", "must be a non-empty array when provided");
    } else {
      teamView.commentFields.forEach((field, index) => {
        const base = `display.teamView.commentFields[${index}]`;
        if (!field?.field) addIssue(issues, `${base}.field`, "is required");
        if (!field?.dataKey) addIssue(issues, `${base}.dataKey`, "is required");
        if (!field?.title) addIssue(issues, `${base}.title`, "is required");
        if (field?.field) {
          validateFieldRef(issues, fieldSet, `${base}.field`, field.field);
        }
      });
    }
  } else if (!Array.isArray(teamView.comments) || teamView.comments.length === 0) {
    addIssue(
      issues,
      "display.teamView.commentFields",
      "configure commentFields (preferred) or comments to show team comments"
    );
  }

  if (teamView.defenseBarField) {
    validateFieldRef(issues, fieldSet, "display.teamView.defenseBarField", teamView.defenseBarField);
  }

  if (Array.isArray(teamView.qualitativeDisplay)) {
    teamView.qualitativeDisplay.forEach((entry, index) => {
      if (!entry?.name) {
        addIssue(issues, `display.teamView.qualitativeDisplay[${index}].name`, "is required");
        return;
      }
      validateFieldRef(issues, fieldSet, `display.teamView.qualitativeDisplay[${index}].name`, entry.name);
    });
  }

  if (Array.isArray(teamView.intakeDisplay)) {
    teamView.intakeDisplay.forEach((group, groupIndex) => {
      if (!Array.isArray(group?.fields)) return;
      group.fields.forEach((fieldName, fieldIndex) => {
        validateFieldRef(
          issues,
          fieldSet,
          `display.teamView.intakeDisplay[${groupIndex}].fields[${fieldIndex}]`,
          fieldName
        );
      });
    });
  }

  return issues;
}

export function getMatchViewConfigIssues(config) {
  const issues = [];
  const display = config?.display;
  const matchView = display?.matchView;
  const fieldSet = getFieldSet(config);

  if (!matchView || typeof matchView !== "object") {
    addIssue(issues, "display.matchView", "is missing");
    return issues;
  }

  const bars = matchView.piecePlacement?.bars;
  const hasPiecePlacement = Array.isArray(bars) && bars.length > 0;

  const alliancePiecePlacement = display?.apiAggregation?.alliancePiecePlacement;
  const hasAlliancePiecePlacement = Array.isArray(alliancePiecePlacement) && alliancePiecePlacement.length > 0;

  // piecePlacement is optional — only validate if either side is non-empty
  if (hasPiecePlacement && !hasAlliancePiecePlacement) {
    addIssue(
      issues,
      "display.apiAggregation.alliancePiecePlacement",
      "must be a non-empty array when display.matchView.piecePlacement.bars is defined"
    );
  }
  if (!hasPiecePlacement && hasAlliancePiecePlacement) {
    addIssue(issues, "display.matchView.piecePlacement.bars", "must be a non-empty array when display.apiAggregation.alliancePiecePlacement is defined");
  }

  if (hasAlliancePiecePlacement) {
    alliancePiecePlacement.forEach((entry, index) => {
      const base = `display.apiAggregation.alliancePiecePlacement[${index}]`;
      if (!entry?.key) {
        addIssue(issues, `${base}.key`, "is required");
      }
      if (!Array.isArray(entry?.fields) || entry.fields.length === 0) {
        addIssue(issues, `${base}.fields`, "must be a non-empty array");
      } else {
        entry.fields.forEach((fieldName, fieldIndex) => {
          validateFieldRef(issues, fieldSet, `${base}.fields[${fieldIndex}]`, fieldName);
        });
      }
    });
  }

  const allianceKeys = new Set(
    (Array.isArray(alliancePiecePlacement) ? alliancePiecePlacement : [])
      .map((entry) => entry?.key)
      .filter(Boolean)
  );

  if (Array.isArray(bars)) {
    bars.forEach((bar, index) => {
      const base = `display.matchView.piecePlacement.bars[${index}]`;
      if (!bar?.label) addIssue(issues, `${base}.label`, "is required");
      if (!bar?.key) {
        addIssue(issues, `${base}.key`, "is required");
      } else if (allianceKeys.size > 0 && !allianceKeys.has(bar.key)) {
        addIssue(
          issues,
          `${base}.key`,
          `"${bar.key}" is not defined in display.apiAggregation.alliancePiecePlacement`
        );
      }
    });
  }

  const endgameLabels = matchView.endgamePie?.labels;
  const endgameKeys = matchView.endgamePie?.keys;
  if (!Array.isArray(endgameLabels) || endgameLabels.length === 0) {
    addIssue(issues, "display.matchView.endgamePie.labels", "must be a non-empty array");
  }
  if (!Array.isArray(endgameKeys) || endgameKeys.length === 0) {
    addIssue(issues, "display.matchView.endgamePie.keys", "must be a non-empty array");
  } else if (Array.isArray(endgameLabels) && endgameLabels.length !== endgameKeys.length) {
    addIssue(issues, "display.matchView.endgamePie", "labels and keys must have the same length");
  }

  const valueMapping = display?.apiAggregation?.endgameConfig?.valueMapping;
  if (!valueMapping || typeof valueMapping !== "object") {
    addIssue(
      issues,
      "display.apiAggregation.endgameConfig.valueMapping",
      "is required for match-view endgame chart"
    );
  } else if (Array.isArray(endgameKeys)) {
    const mappedKeys = new Set(Object.values(valueMapping));
    endgameKeys.forEach((key, index) => {
      if (!mappedKeys.has(key)) {
        addIssue(
          issues,
          `display.matchView.endgamePie.keys[${index}]`,
          `"${key}" is not present in display.apiAggregation.endgameConfig.valueMapping values`
        );
      }
    });
  }

  if (Array.isArray(matchView.qualitativeFields)) {
    matchView.qualitativeFields.forEach((fieldName, index) => {
      validateFieldRef(issues, fieldSet, `display.matchView.qualitativeFields[${index}]`, fieldName);
    });
  }

  if (matchView.defenseBarField) {
    validateFieldRef(issues, fieldSet, "display.matchView.defenseBarField", matchView.defenseBarField);
  }

  if (matchView.rankingPoints && !Array.isArray(matchView.rankingPoints)) {
    addIssue(issues, "display.matchView.rankingPoints", "must be an array when provided");
  } else if (Array.isArray(matchView.rankingPoints)) {
    const supportedTypes = new Set([
      "allLeaveAndCoral",
      "allFieldsAndThreshold",
      "levelThreshold",
      "endgameThreshold",
    ]);

    matchView.rankingPoints.forEach((rp, index) => {
      const base = `display.matchView.rankingPoints[${index}]`;
      if (!rp?.type || !supportedTypes.has(rp.type)) {
        addIssue(issues, `${base}.type`, "must be one of allLeaveAndCoral, allFieldsAndThreshold, levelThreshold, endgameThreshold");
        return;
      }

      if (rp.leaveField) {
        validateFieldRef(issues, fieldSet, `${base}.leaveField`, rp.leaveField);
      }

      if (rp.type === "allLeaveAndCoral" || rp.type === "allFieldsAndThreshold") {
        const hasCoralField = typeof rp.coralField === "string" && rp.coralField.length > 0;
        const hasCoralFields = Array.isArray(rp.coralFields) && rp.coralFields.length > 0;

        if (!hasCoralField && !hasCoralFields) {
          addIssue(issues, base, "must define coralField or coralFields");
        }

        if (hasCoralField) {
          if (!allianceKeys.has(rp.coralField) && !fieldSet.has(rp.coralField.toLowerCase())) {
            addIssue(issues, `${base}.coralField`, `unknown metric or field "${rp.coralField}"`);
          }
        }

        if (hasCoralFields) {
          rp.coralFields.forEach((fieldName, fieldIndex) => {
            if (!allianceKeys.has(fieldName) && !fieldSet.has(String(fieldName).toLowerCase())) {
              addIssue(issues, `${base}.coralFields[${fieldIndex}]`, `unknown metric or field "${fieldName}"`);
            }
          });
        }
      }

      if (rp.type === "levelThreshold") {
        if (Array.isArray(rp.levels)) {
          if (rp.levels.length === 0) {
            addIssue(issues, `${base}.levels`, "must not be empty");
          }
          rp.levels.forEach((level, levelIndex) => {
            if (!level?.key) {
              addIssue(issues, `${base}.levels[${levelIndex}].key`, "is required");
              return;
            }
            if (!allianceKeys.has(level.key) && !fieldSet.has(level.key.toLowerCase())) {
              addIssue(issues, `${base}.levels[${levelIndex}].key`, `unknown metric or field "${level.key}"`);
            }
          });
        } else if (rp.levels && typeof rp.levels === "object") {
          Object.entries(rp.levels).forEach(([levelKey, fields], objectIndex) => {
            if (!Array.isArray(fields) || fields.length === 0) {
              addIssue(issues, `${base}.levels.${levelKey}`, "must be a non-empty array of field names");
              return;
            }
            fields.forEach((fieldName, fieldIndex) => {
              validateFieldRef(
                issues,
                fieldSet,
                `${base}.levels.${levelKey}[${fieldIndex}]`,
                fieldName
              );
            });
          });
        } else {
          addIssue(issues, `${base}.levels`, "must be an array or object");
        }
      }

      if (rp.type === "endgameThreshold" && !rp.field && !rp.calcKey) {
        addIssue(issues, base, "must define field or calcKey");
      }
    });
  }

  return issues;
}
