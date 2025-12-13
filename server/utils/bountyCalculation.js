/**
 * Calculate bounty amount for a knockout
 * Bounty = ceil(buy-in / 2) to avoid rounding issues
 * 
 * @param {number} entryPrice - The tournament entry price
 * @param {string} tournamentType - The tournament type ('ko', 'mystery_ko', or other)
 * @param {number} [multiplier] - Optional multiplier for mystery KO (randomly selected if not provided)
 * @returns {number} The bounty amount (always an integer)
 */
export function calculateBountyAmount(entryPrice, tournamentType, multiplier = null) {
  if (tournamentType !== 'ko' && tournamentType !== 'mystery_ko') {
    return 0;
  }
  
  // Base bounty = ceil(buy-in / 2)
  const baseBounty = Math.ceil(parseFloat(entryPrice) / 2);
  
  if (tournamentType === 'mystery_ko') {
    // Random bounty multiplier for mystery KO
    if (multiplier === null) {
      const multipliers = [0.5, 1, 1, 1, 1, 2, 2, 3, 5, 10];
      multiplier = multipliers[Math.floor(Math.random() * multipliers.length)];
    }
    return Math.ceil(baseBounty * multiplier);
  }
  
  // For KO: each bounty is ceil(buy-in / 2), always an integer
  return baseBounty;
}

/**
 * Get bounty amount from database value, ensuring it's an integer
 * This handles cases where the value might be stored as a decimal
 * 
 * @param {number|string} bountyAmount - The bounty amount from database
 * @returns {number} The bounty amount as an integer
 */
export function getBountyAsInteger(bountyAmount) {
  return Math.round(parseFloat(bountyAmount || 0));
}
