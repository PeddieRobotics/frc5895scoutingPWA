/**
 * opr-calculator.js
 *
 * Pure-JS OPR (Offensive Power Rating) calculator.
 * No external dependencies — uses Gaussian elimination with partial pivoting
 * to solve the least-squares system:
 *
 *   X = (MT·M)^-1 · MT·s
 *
 * Where:
 *   M  = match-participation matrix (2 rows per match, 1 per alliance;
 *         column j = 1 if team j played in that alliance, else 0)
 *   s  = score vector (one entry per alliance per match)
 *   X  = resulting OPR per team
 *
 * Safe to import in "use client" components — contains no server-only code.
 */

/**
 * Multiply two matrices A (m×n) and B (n×p), returning an m×p result.
 * @param {number[][]} A
 * @param {number[][]} B
 * @returns {number[][]}
 */
function matMul(A, B) {
  const m = A.length;
  const n = B.length;
  const p = B[0].length;
  const result = [];
  for (let i = 0; i < m; i++) {
    result[i] = new Array(p).fill(0);
    for (let k = 0; k < n; k++) {
      if (A[i][k] === 0) continue;
      for (let j = 0; j < p; j++) {
        result[i][j] += A[i][k] * B[k][j];
      }
    }
  }
  return result;
}

/**
 * Transpose a matrix M (m×n) → (n×m).
 * @param {number[][]} M
 * @returns {number[][]}
 */
function matTranspose(M) {
  const m = M.length;
  const n = M[0].length;
  const result = [];
  for (let j = 0; j < n; j++) {
    result[j] = new Array(m);
    for (let i = 0; i < m; i++) {
      result[j][i] = M[i][j];
    }
  }
  return result;
}

/**
 * Solve the linear system A·x = b using Gaussian elimination with partial
 * pivoting. Operates on copies — does not mutate inputs.
 *
 * @param {number[][]} A - n×n square matrix
 * @param {number[]} b  - length-n right-hand-side vector
 * @returns {number[]|null} Solution vector x, or null if the system is singular
 */
function gaussianElimination(A, b) {
  const n = A.length;
  // Deep copy to avoid mutating caller's data
  const a = A.map((row) => [...row]);
  const x = [...b];

  for (let col = 0; col < n; col++) {
    // Partial pivot: find row with largest absolute value in this column
    let maxRow = col;
    let maxVal = Math.abs(a[col][col]);
    for (let row = col + 1; row < n; row++) {
      const v = Math.abs(a[row][col]);
      if (v > maxVal) {
        maxVal = v;
        maxRow = row;
      }
    }

    // Swap pivot row into position
    if (maxRow !== col) {
      [a[col], a[maxRow]] = [a[maxRow], a[col]];
      [x[col], x[maxRow]] = [x[maxRow], x[col]];
    }

    // Singular check
    if (Math.abs(a[col][col]) < 1e-10) return null;

    // Forward elimination: zero out entries below the pivot
    const pivot = a[col][col];
    for (let row = col + 1; row < n; row++) {
      const factor = a[row][col] / pivot;
      for (let k = col; k < n; k++) {
        a[row][k] -= factor * a[col][k];
      }
      x[row] -= factor * x[col];
    }
  }

  // Back substitution
  const result = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    result[i] = x[i];
    for (let j = i + 1; j < n; j++) {
      result[i] -= a[i][j] * result[j];
    }
    result[i] /= a[i][i];
  }
  return result;
}

/**
 * Compute OPR for all teams from a set of played matches.
 *
 * @param {Array<{
 *   redTeams: number[],
 *   blueTeams: number[],
 *   redScore: number,
 *   blueScore: number
 * }>} matches - Matches to include. Each entry must have arrays of team numbers
 *               and numeric scores for both alliances.
 * @param {number} [lambda=0] - Tikhonov regularization parameter. Adding a small
 *   positive value (e.g. 1.0) to the diagonal of MT·M stabilises the solve when
 *   few matches have been played and the system would otherwise be singular.
 *   Has negligible effect once teams have played several matches.
 *
 * @returns {Array<{team: number, opr: number}>|null}
 *   Teams sorted descending by OPR, or null if the system cannot be solved
 *   (e.g. too few matches, singular participation matrix).
 */
export function computeOPR(matches, lambda = 0) {
  if (!matches || matches.length === 0) return null;

  // 1. Collect all unique team numbers
  const teamSet = new Set();
  for (const m of matches) {
    (m.redTeams || []).forEach((t) => teamSet.add(t));
    (m.blueTeams || []).forEach((t) => teamSet.add(t));
  }
  if (teamSet.size === 0) return null;

  const teams = Array.from(teamSet).sort((a, b) => a - b);
  const n = teams.length;
  const teamIndex = new Map(teams.map((t, i) => [t, i]));

  // 2. Build M (participation matrix, 2 rows per match) and s (score vector)
  const M = [];
  const s = [];
  for (const m of matches) {
    const rowRed = new Array(n).fill(0);
    const rowBlue = new Array(n).fill(0);
    (m.redTeams || []).forEach((t) => {
      if (teamIndex.has(t)) rowRed[teamIndex.get(t)] = 1;
    });
    (m.blueTeams || []).forEach((t) => {
      if (teamIndex.has(t)) rowBlue[teamIndex.get(t)] = 1;
    });
    M.push(rowRed);
    M.push(rowBlue);
    s.push(m.redScore ?? 0);
    s.push(m.blueScore ?? 0);
  }

  // 3. Compute MT and the normal matrix MT·M (n×n)
  const MT = matTranspose(M);
  const MTM = matMul(MT, M);

  // 4. Compute right-hand side MT·s (length n)
  const MTs = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < s.length; j++) {
      MTs[i] += MT[i][j] * s[j];
    }
  }

  // 5. Optional Tikhonov regularisation: add λ to diagonal of MT·M
  if (lambda > 0) {
    for (let i = 0; i < n; i++) MTM[i][i] += lambda;
  }

  // 6. Solve (MTM + λI) · X = MTs
  const X = gaussianElimination(MTM, MTs);
  if (!X) return null;

  // 7. Return sorted results
  return teams
    .map((team, i) => ({ team, opr: X[i] }))
    .sort((a, b) => b.opr - a.opr);
}
