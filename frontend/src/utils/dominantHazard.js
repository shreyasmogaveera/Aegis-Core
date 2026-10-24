/**
 * Canonical Dominant Hazard Resolution Engine (Frontend ESM)
 *
 * Implements strict, symmetric, hazard-agnostic priority:
 * 1. Operational Tier Rank (CRITICAL: 4 > HIGH: 3 > MODERATE: 2 > LOW: 1)
 * 2. Evaluated Probability Tie-Breaker (calibratedProbability ?? riskScore)
 * 3. Timestamp Recency Tie-Breaker (createdAt / updatedAt)
 *
 * Referenced by:
 * - frontend/src/components/map/AegisMap.jsx (Tactical Overview Map)
 * - frontend/src/pages/admin/AdminRiskAnalysis.jsx (Risk Analysis Detail)
 * Canonical counterpart: backend/src/utils/dominantHazard.js
 */

export const TIER_RANK = Object.freeze({
  CRITICAL: 4,
  HIGH: 3,
  MODERATE: 2,
  LOW: 1
});

export const getRiskTierRank = (riskLevel) => {
  return TIER_RANK[String(riskLevel || '').toUpperCase()] || 1;
};

export const getEvaluatedProbability = (pred) => {
  if (!pred) return 0;
  const val = pred.calibratedProbability !== undefined && pred.calibratedProbability !== null
    ? pred.calibratedProbability
    : (pred.riskScore !== undefined ? pred.riskScore : (pred.event_probability ?? 0));
  return Number(val) || 0;
};

/**
 * Returns the dominant prediction among candidates using the canonical hierarchy.
 * @param  {...any} predictions - Array or arguments of Prediction objects
 * @returns {object|null} The dominant prediction object
 */
export const resolveDominantPrediction = (...predictions) => {
  const valid = (predictions.flat ? predictions.flat() : predictions).filter(Boolean);
  if (valid.length === 0) return null;
  if (valid.length === 1) return valid[0];

  return valid.slice().sort((a, b) => {
    // Rule 1: Highest operational tier rank wins
    const rankA = getRiskTierRank(a.riskLevel);
    const rankB = getRiskTierRank(b.riskLevel);
    if (rankB !== rankA) return rankB - rankA;

    // Rule 2: Symmetric tie-breaker — higher evaluated probability wins
    const probA = getEvaluatedProbability(a);
    const probB = getEvaluatedProbability(b);
    if (Math.abs(probB - probA) > 0.0001) return probB - probA;

    // Rule 3: Recency tie-breaker
    const timeA = new Date(a.createdAt || a.updatedAt || 0).getTime();
    const timeB = new Date(b.createdAt || b.updatedAt || 0).getTime();
    return timeB - timeA;
  })[0];
};
