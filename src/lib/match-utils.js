/**
 * Normalize match and matchType values to the storage format used by the scouting table.
 * matchType mapping:
 * 0 => practice  (subtract 100)
 * 1 => test      (subtract 50)
 * 2 => qual      (no change)
 * 3 => playoffs  (add 100)
 */
function normalizeMatchForStorage(matchValue, matchTypeValue = 2) {
  const parsedMatchType = Number.parseInt(matchTypeValue, 10);
  const matchType = Number.isNaN(parsedMatchType) ? 2 : parsedMatchType;

  const parsedMatch = Number.parseInt(matchValue, 10);
  if (Number.isNaN(parsedMatch)) {
    return { match: null, matchType };
  }

  let adjustedMatch = parsedMatch;
  switch (matchType) {
    case 0:
      adjustedMatch -= 100;
      break;
    case 1:
      adjustedMatch -= 50;
      break;
    case 3:
      adjustedMatch += 100;
      break;
    default:
      break;
  }

  return { match: adjustedMatch, matchType };
}

export { normalizeMatchForStorage };
