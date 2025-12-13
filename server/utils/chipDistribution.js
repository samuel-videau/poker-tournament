// Chip set configuration
export const CHIP_SET = {
  5: 150,
  10: 100,
  25: 100,
  100: 100,
  500: 25,
  1000: 25
};

// Get available chip denominations sorted in descending order
function getAvailableDenominations() {
  return Object.keys(CHIP_SET)
    .map(Number)
    .sort((a, b) => b - a);
}

// Calculate GCD (Greatest Common Divisor) of two numbers
function gcd(a, b) {
  if (b === 0) return a;
  return gcd(b, a % b);
}

// Calculate GCD of all chip denominations to find the base unit
function getChipBaseUnit() {
  const denominations = getAvailableDenominations();
  if (denominations.length === 0) return 1;
  
  let result = denominations[0];
  for (let i = 1; i < denominations.length; i++) {
    result = gcd(result, denominations[i]);
  }
  return result;
}

// Calculate minimum chips needed to make an exact amount using available denominations
// Always uses the smallest denomination (5s) when possible to ensure players have small chips for blinds
function calculateMinChipsForAmount(amount, denominations) {
  if (amount === 0) return {};
  if (amount < 0) return {};
  
  const smallestDenom = Math.min(...denominations);
  const baseUnit = getChipBaseUnit();
  const chips = {};
  
  // Always prefer using the smallest denomination (base unit) when the amount is divisible by it
  // This ensures players have small chips (like 5s) to pay blinds like 15, 30, etc.
  // For example: 10 should use 2×5s, not 1×10
  //              15 should use 3×5s, not 1×10 + 1×5
  //              30 should use 6×5s, not 3×10s or 1×25 + 1×5
  
  // Check if amount can be made entirely with base unit (smallest denomination)
  if (amount % baseUnit === 0) {
    chips[baseUnit] = amount / baseUnit;
    return chips;
  }
  
  // If not divisible by base unit, we need a mix
  // But still prefer using base unit as much as possible
  let remaining = amount;
  
  // First, use as many base units as possible
  if (remaining >= baseUnit) {
    const baseCount = Math.floor(remaining / baseUnit);
    chips[baseUnit] = baseCount;
    remaining -= baseCount * baseUnit;
  }
  
  // Then use larger denominations for the remainder
  const sortedDenomsDesc = [...denominations].sort((a, b) => b - a);
  for (const denom of sortedDenomsDesc) {
    if (remaining <= 0) break;
    if (denom <= baseUnit) continue; // Skip base unit, already handled
    
    if (remaining >= denom) {
      const count = Math.floor(remaining / denom);
      if (count > 0) {
        chips[denom] = count;
        remaining -= count * denom;
      }
    }
  }
  
  // If there's still a remainder, use base unit to cover it
  if (remaining > 0) {
    const additionalChips = Math.ceil(remaining / baseUnit);
    chips[baseUnit] = (chips[baseUnit] || 0) + additionalChips;
  }
  
  return chips;
}

// Calculate minimum chips needed for blind structure
function calculateMinChipsForBlinds(blindStructure, denominations, maxPossibleEntries) {
  const minChipsForBlinds = {};
  const sortedDenomsAsc = [...denominations].sort((a, b) => a - b);
  const baseUnit = getChipBaseUnit();
  const smallestDenom = Math.min(...denominations);
  
  if (blindStructure && blindStructure.levels && blindStructure.levels.length > 0) {
    // Look at early levels to determine minimum chip requirements
    const earlyLevels = blindStructure.levels.slice(0, Math.min(12, blindStructure.levels.length));
    
    // For each early level, calculate what chips are needed to pay each component separately
    for (const level of earlyLevels) {
      // Calculate chips needed for small blind
      if (level.sb > 0) {
        const sbChips = calculateMinChipsForAmount(level.sb, denominations);
        for (const [denom, count] of Object.entries(sbChips)) {
          minChipsForBlinds[denom] = Math.max(minChipsForBlinds[denom] || 0, count);
        }
      }
      
      // Calculate chips needed for big blind
      if (level.bb > 0) {
        const bbChips = calculateMinChipsForAmount(level.bb, denominations);
        for (const [denom, count] of Object.entries(bbChips)) {
          minChipsForBlinds[denom] = Math.max(minChipsForBlinds[denom] || 0, count);
        }
      }
      
      // Calculate chips needed for ante
      if (level.ante > 0) {
        const anteChips = calculateMinChipsForAmount(level.ante, denominations);
        for (const [denom, count] of Object.entries(anteChips)) {
          minChipsForBlinds[denom] = Math.max(minChipsForBlinds[denom] || 0, count);
        }
      }
    }
    
    // Add buffer: players need to pay blinds multiple times
    const bufferMultiplier = 6; // Enough for 6 blind payments
    for (const denom of sortedDenomsAsc) {
      if (minChipsForBlinds[denom] && denom <= 100) {
        minChipsForBlinds[denom] = Math.ceil(minChipsForBlinds[denom] * bufferMultiplier);
      }
    }
    
    // Ensure we always allocate the smallest denomination if any blind requires it
    if (baseUnit === smallestDenom && !minChipsForBlinds[smallestDenom]) {
      for (const level of earlyLevels) {
        const needsSmallest = 
          (level.sb > 0 && level.sb % smallestDenom === 0 && level.sb < smallestDenom * 10) ||
          (level.bb > 0 && level.bb % smallestDenom === 0 && level.bb < smallestDenom * 10) ||
          (level.ante > 0 && level.ante % smallestDenom === 0 && level.ante < smallestDenom * 10);
        
        if (needsSmallest) {
          minChipsForBlinds[smallestDenom] = Math.max(
            minChipsForBlinds[smallestDenom] || 0,
            Math.ceil((level.bb || smallestDenom * 2) / smallestDenom) * bufferMultiplier
          );
          break;
        }
      }
    }
  }
  
  return minChipsForBlinds;
}

// Calculate chip distribution for starting stack, accounting for blind levels
export function calculateChipDistribution(startingStack, numPlayers, blindStructure = null, maxReentries = 0) {
  const distribution = {};
  const sortedDenomsAsc = getAvailableDenominations().sort((a, b) => a - b);
  const baseUnit = getChipBaseUnit();
  
  // Calculate total possible entries (initial entries + reentries)
  const maxPossibleEntries = numPlayers * (maxReentries + 1);
  
  // Step 1: Calculate max chips per entry for each denomination
  const maxChipsPerEntry = {};
  for (const denom of sortedDenomsAsc) {
    const totalChips = CHIP_SET[denom];
    maxChipsPerEntry[denom] = Math.floor(totalChips / maxPossibleEntries);
  }
  
  // Step 2: Calculate minimum chips needed for blinds
  const minChipsForBlinds = calculateMinChipsForBlinds(blindStructure, sortedDenomsAsc, maxPossibleEntries);
  
  // Always ensure we have at least some base unit chips for flexibility
  // Even without blind structure, keep at least a few base units
  if (!minChipsForBlinds[baseUnit] || minChipsForBlinds[baseUnit] === 0) {
    // Keep at least 5-10 base unit chips for small blind payments
    const minBaseUnits = Math.min(10, maxChipsPerEntry[baseUnit] || 0);
    if (minBaseUnits > 0) {
      minChipsForBlinds[baseUnit] = minBaseUnits;
    }
  }
  
  // Step 3: Start with max chips per entry for all denominations (most spread out)
  let totalDistributed = 0;
  const targetStack = startingStack;
  
  for (const denom of sortedDenomsAsc) {
    if (maxChipsPerEntry[denom] > 0) {
      distribution[denom] = maxChipsPerEntry[denom];
      totalDistributed += distribution[denom] * denom;
    }
  }
  
  // Step 4: Ensure minimum chips for blinds are allocated
  for (const denom of sortedDenomsAsc) {
    const minNeeded = minChipsForBlinds[denom] || 0;
    const alreadyAllocated = distribution[denom] || 0;
    
    if (minNeeded > alreadyAllocated) {
      const additionalNeeded = minNeeded - alreadyAllocated;
      const chipsAvailable = maxChipsPerEntry[denom] - alreadyAllocated;
      const chipsToAdd = Math.min(additionalNeeded, chipsAvailable);
      
      if (chipsToAdd > 0) {
        distribution[denom] = (distribution[denom] || 0) + chipsToAdd;
        totalDistributed += chipsToAdd * denom;
      }
    }
  }
  
  // Step 5: Adjust to reach exact starting stack
  let gap = targetStack - totalDistributed;
  
  // If over, reduce from largest (but preserve minimum for blinds and base units)
  if (gap < 0) {
    let excess = -gap;
    
    // Try to remove exactly the excess using a combination of chips
    // Prefer removing larger multiples first to preserve smaller chips and base units
    // But always preserve at least 1 chip of each multiple for swap flexibility
    const multiplesOfBaseUnit = sortedDenomsAsc.filter(d => d % baseUnit === 0 && d !== baseUnit).sort((a, b) => b - a); // Largest first
    
    // Try to find a combination that removes exactly the excess
    let remainingExcess = excess;
    const chipsToRemove = {};
    
    // Try removing from largest multiples first to preserve smaller chips
    // But preserve at least 1 of each for swap flexibility
    for (const denom of multiplesOfBaseUnit) {
      if (remainingExcess <= 0) break;
      if (!distribution[denom] || distribution[denom] === 0) continue;
      
      const minRequired = minChipsForBlinds[denom] || 0;
      const preserveForSwaps = 1; // Always keep at least 1 for swap flexibility
      const canRemove = Math.max(0, distribution[denom] - Math.max(minRequired, preserveForSwaps));
      
      if (canRemove > 0 && remainingExcess >= denom) {
        const idealCount = Math.floor(remainingExcess / denom);
        const count = Math.min(canRemove, idealCount);
        
        if (count > 0) {
          chipsToRemove[denom] = count;
          remainingExcess -= count * denom;
        }
      }
    }
    
    // If still have excess, try smaller multiples
    if (remainingExcess > 0) {
      const smallerMultiples = multiplesOfBaseUnit.filter(d => !chipsToRemove[d]).sort((a, b) => a - b);
      
      for (const denom of smallerMultiples) {
        if (remainingExcess <= 0) break;
        if (!distribution[denom] || distribution[denom] === 0) continue;
        
        const minRequired = minChipsForBlinds[denom] || 0;
        const preserveForSwaps = 1;
        const canRemove = Math.max(0, distribution[denom] - Math.max(minRequired, preserveForSwaps) - (chipsToRemove[denom] || 0));
        
        if (canRemove > 0 && remainingExcess >= denom) {
          const idealCount = Math.floor(remainingExcess / denom);
          const count = Math.min(canRemove, idealCount);
          
          if (count > 0) {
            chipsToRemove[denom] = (chipsToRemove[denom] || 0) + count;
            remainingExcess -= count * denom;
          }
        }
      }
    }
    
    // Apply the removals
    for (const [denom, count] of Object.entries(chipsToRemove)) {
      distribution[denom] -= count;
      totalDistributed -= count * parseInt(denom);
      
      if (distribution[denom] === 0) {
        delete distribution[denom];
      }
    }
    
    // If there's a small remainder, try to handle it precisely
    if (remainingExcess > 0) {
      // Try to remove exactly the remainder using base units or small multiples
      if (remainingExcess <= baseUnit * 5) {
        // Try removing base units
        const minRequired = minChipsForBlinds[baseUnit] || 0;
        const canRemove = (distribution[baseUnit] || 0) - minRequired;
        const needed = Math.ceil(remainingExcess / baseUnit);
        
        if (canRemove >= needed) {
          distribution[baseUnit] -= needed;
          totalDistributed -= needed * baseUnit;
          remainingExcess = 0;
          
          if (distribution[baseUnit] === 0) {
            delete distribution[baseUnit];
          }
        } else {
          // Can't remove enough base units, try removing a small multiple and adding base units
          // Example: need to remove 5, but can't. Remove 1×10, add 2×5s (but we can't add more 5s)
          // So try: remove 1×10, we get -10, then we're under by 5, which we'll fill later
          for (const denom of multiplesOfBaseUnit) {
            if (remainingExcess <= 0) break;
            if (!distribution[denom] || distribution[denom] === 0) continue;
            
            const minRequired = minChipsForBlinds[denom] || 0;
            if (distribution[denom] > minRequired) {
              // Remove one chip
              distribution[denom] -= 1;
              totalDistributed -= denom;
              remainingExcess = targetStack - totalDistributed; // Recalculate
              break;
            }
          }
        }
      } else {
        // Larger remainder - use standard removal
        const sortedDenomsDesc = [...sortedDenomsAsc].sort((a, b) => b - a);
        
        for (const denom of sortedDenomsDesc) {
          if (remainingExcess <= 0) break;
          if (!distribution[denom] || distribution[denom] === 0) continue;
          
          const minRequired = minChipsForBlinds[denom] || 0;
          const canRemove = distribution[denom] - minRequired;
          
          if (canRemove > 0) {
            const idealChipsToRemove = Math.floor(remainingExcess / denom);
            const chipsToRemove = Math.min(
              canRemove,
              idealChipsToRemove > 0 ? idealChipsToRemove : Math.ceil(remainingExcess / denom)
            );
            
            if (chipsToRemove > 0) {
              const valueRemoved = chipsToRemove * denom;
              distribution[denom] -= chipsToRemove;
              totalDistributed -= valueRemoved;
              remainingExcess -= valueRemoved;
              
              if (distribution[denom] === 0) {
                delete distribution[denom];
              }
            }
          }
        }
      }
    }
    
    gap = targetStack - totalDistributed;
  }
  
  // If under, fill the gap aggressively (but preserve minimum for blinds when swapping)
  if (gap > 0) {
    let iterations = 0;
    const maxIterations = 200;
    
    while (gap > 0 && iterations < maxIterations) {
      iterations++;
      let madeProgress = false;
      const gapBefore = gap;
      
      // Strategy: Try adding chips from largest to smallest
      const sortedDenomsDesc = [...sortedDenomsAsc].sort((a, b) => b - a);
      
      for (const denom of sortedDenomsDesc) {
        if (gap <= 0) break;
        
        const alreadyAllocated = distribution[denom] || 0;
        const chipsAvailable = maxChipsPerEntry[denom] - alreadyAllocated;
        
        if (chipsAvailable > 0) {
          // First, try adding as many as we can directly
          const maxToAdd = Math.floor(gap / denom);
          if (maxToAdd > 0) {
            const chipsToAdd = Math.min(chipsAvailable, maxToAdd);
            const newTotal = totalDistributed + (chipsToAdd * denom);
            
            if (newTotal <= targetStack) {
              // Can add directly
              distribution[denom] = (distribution[denom] || 0) + chipsToAdd;
              totalDistributed = newTotal;
              gap = targetStack - totalDistributed;
              madeProgress = true;
              continue;
            }
          }
          
          // If can't add directly, try adding one chip and swapping
          const newTotal = totalDistributed + denom;
          
          if (newTotal <= targetStack) {
            // Can add one directly
            distribution[denom] = (distribution[denom] || 0) + 1;
            totalDistributed = newTotal;
            gap = targetStack - totalDistributed;
            madeProgress = true;
          } else {
            // Would exceed - try swapping: add this chip, remove smaller ones
            // BUT preserve minimum required for blinds
            const excess = newTotal - targetStack;
            let canRemove = 0;
            const chipsToRemove = {};
            
            // Try to find smaller chips to remove (greedy approach)
            // But don't remove below minimum required for blinds
            for (const smallerDenom of sortedDenomsAsc) {
              if (smallerDenom >= denom) break;
              if (excess <= canRemove) break;
              
              const available = distribution[smallerDenom] || 0;
              const minRequired = minChipsForBlinds[smallerDenom] || 0;
              const canRemoveFromThis = Math.max(0, available - minRequired);
              
              if (canRemoveFromThis > 0) {
                const stillNeeded = excess - canRemove;
                const needed = Math.ceil(stillNeeded / smallerDenom);
                const toRemove = Math.min(canRemoveFromThis, needed);
                
                if (toRemove > 0) {
                  chipsToRemove[smallerDenom] = toRemove;
                  canRemove += toRemove * smallerDenom;
                }
              }
            }
            
            // If we can remove enough, do the swap
            if (canRemove >= excess) {
              // Remove smaller chips
              for (const [smallerDenom, count] of Object.entries(chipsToRemove)) {
                distribution[smallerDenom] -= count;
                totalDistributed -= count * parseInt(smallerDenom);
                
                if (distribution[smallerDenom] === 0) {
                  delete distribution[smallerDenom];
                }
              }
              
              // Add larger chip
              distribution[denom] = (distribution[denom] || 0) + 1;
              totalDistributed += denom;
              gap = targetStack - totalDistributed;
              madeProgress = true;
            }
          }
        }
      }
      
      // If no progress with larger chips, try adding multiple smaller chips
      if (!madeProgress) {
        for (const denom of sortedDenomsAsc) {
          if (gap <= 0) break;
          
          const alreadyAllocated = distribution[denom] || 0;
          const chipsAvailable = maxChipsPerEntry[denom] - alreadyAllocated;
          
          if (chipsAvailable > 0) {
            // Add as many as we can without exceeding
            const maxToAdd = Math.floor(gap / denom);
            if (maxToAdd > 0) {
              const chipsToAdd = Math.min(chipsAvailable, maxToAdd);
              
              if (chipsToAdd > 0) {
                distribution[denom] = (distribution[denom] || 0) + chipsToAdd;
                totalDistributed += chipsToAdd * denom;
                gap = targetStack - totalDistributed;
                madeProgress = true;
                break;
              }
            }
          }
        }
      }
      
      // If no progress at all, try one more strategy: swap to fill small gaps
      if (!madeProgress && gap > 0 && gap < baseUnit * 2) {
        // For small gaps, try swapping: remove a slightly larger chip, add base units
        // Example: gap = 5, remove 1×10, add 2×5 = net +5
        for (const denom of sortedDenomsAsc) {
          if (denom <= baseUnit) continue;
          if (gap <= 0) break;
          
          const available = distribution[denom] || 0;
          if (available > 0) {
            // Check if removing this chip and adding base units helps
            const baseUnitsAvailable = maxChipsPerEntry[baseUnit] - (distribution[baseUnit] || 0);
            const baseUnitsNeeded = Math.ceil((denom + gap) / baseUnit);
            
            if (baseUnitsAvailable >= baseUnitsNeeded) {
              // Remove larger chip, add base units
              distribution[denom] -= 1;
              totalDistributed -= denom;
              distribution[baseUnit] = (distribution[baseUnit] || 0) + baseUnitsNeeded;
              totalDistributed += baseUnitsNeeded * baseUnit;
              gap = targetStack - totalDistributed;
              madeProgress = true;
              break;
            }
          }
        }
      }
      
      // If still no progress, break
      if (!madeProgress || gap >= gapBefore) {
        break;
      }
    }
  }
  
  // Final verification and cleanup
  totalDistributed = Object.entries(distribution).reduce((sum, [denom, count]) => {
    return sum + (parseInt(denom) * count);
  }, 0);
  
  // If still over, remove excess from largest (but preserve minimum for blinds)
  if (totalDistributed > targetStack) {
    let excess = totalDistributed - targetStack;
    const sortedDenomsDesc = [...sortedDenomsAsc].sort((a, b) => b - a);
    
    for (const denom of sortedDenomsDesc) {
      if (excess <= 0) break;
      if (!distribution[denom] || distribution[denom] === 0) continue;
      
      // Don't go below minimum required for blinds
      const minRequired = minChipsForBlinds[denom] || 0;
      const canRemove = distribution[denom] - minRequired;
      
      if (canRemove > 0) {
        const chipsToRemove = Math.min(
          canRemove,
          Math.ceil(excess / denom)
        );
        
        if (chipsToRemove > 0) {
          const valueRemoved = chipsToRemove * denom;
          distribution[denom] -= chipsToRemove;
          excess -= valueRemoved;
          
          if (distribution[denom] === 0) {
            delete distribution[denom];
          }
        }
      }
    }
  }
  
  // Final pass: Try to fill any remaining small gap
  totalDistributed = Object.entries(distribution).reduce((sum, [denom, count]) => {
    return sum + (parseInt(denom) * count);
  }, 0);
  
  let finalGap = targetStack - totalDistributed;
  if (finalGap > 0 && finalGap < baseUnit * 5) {
    // Small gap - try to add base unit chips if available
    const alreadyAllocated = distribution[baseUnit] || 0;
    const chipsAvailable = maxChipsPerEntry[baseUnit] - alreadyAllocated;
    const chipsNeeded = Math.ceil(finalGap / baseUnit);
    
    if (chipsAvailable >= chipsNeeded) {
      distribution[baseUnit] = (distribution[baseUnit] || 0) + chipsNeeded;
      totalDistributed += chipsNeeded * baseUnit;
      finalGap = targetStack - totalDistributed;
    } else if (chipsAvailable === 0 && finalGap === baseUnit) {
      // Can't add more base units, but gap equals one base unit
      // Try swapping: remove a chip worth 2×baseUnit, add 2×baseUnit
      // Example: remove 1×10, add 2×5s
      for (const denom of sortedDenomsAsc) {
        if (denom === baseUnit) continue;
        if (denom !== baseUnit * 2) continue; // Only try exact multiples for simplicity
        
        const available = distribution[denom] || 0;
        if (available > 0) {
          const minRequired = minChipsForBlinds[denom] || 0;
          if (available > minRequired) {
            // Remove one chip of this denomination
            distribution[denom] -= 1;
            totalDistributed -= denom;
            
            // Add base units (we know we can add at least 2 since denom = 2×baseUnit)
            const baseUnitsToAdd = denom / baseUnit;
            const canAdd = Math.min(baseUnitsToAdd, maxChipsPerEntry[baseUnit] - alreadyAllocated);
            if (canAdd >= baseUnitsToAdd) {
              distribution[baseUnit] = (distribution[baseUnit] || 0) + baseUnitsToAdd;
              totalDistributed += baseUnitsToAdd * baseUnit;
              finalGap = targetStack - totalDistributed;
              break;
            } else {
              // Can't add enough, revert
              distribution[denom] += 1;
              totalDistributed += denom;
            }
          }
        }
      }
    }
    
    // If still a gap, try one more time with any available chips
    if (finalGap > 0) {
      for (const denom of sortedDenomsAsc) {
        if (finalGap <= 0) break;
        const alreadyAllocated = distribution[denom] || 0;
        const chipsAvailable = maxChipsPerEntry[denom] - alreadyAllocated;
        
        if (chipsAvailable > 0 && finalGap >= denom) {
          const chipsToAdd = Math.min(chipsAvailable, Math.floor(finalGap / denom));
          if (chipsToAdd > 0) {
            distribution[denom] = (distribution[denom] || 0) + chipsToAdd;
            totalDistributed += chipsToAdd * denom;
            finalGap = targetStack - totalDistributed;
          }
        }
      }
    }
    
    // If still a small gap and we can't add more base units, try swapping
    // Remove a chip that's a multiple of baseUnit, add base units
    if (finalGap > 0 && finalGap < baseUnit * 3) {
      const baseUnitsAllocated = distribution[baseUnit] || 0;
      const baseUnitsAvailable = maxChipsPerEntry[baseUnit] - baseUnitsAllocated;
      
      if (baseUnitsAvailable === 0) {
        // Can't add more base units, try swapping
        for (const denom of sortedDenomsAsc) {
          if (denom === baseUnit) continue;
          if (denom % baseUnit !== 0) continue; // Only swap multiples of baseUnit
          if (!distribution[denom] || distribution[denom] === 0) continue;
          
          const minRequired = minChipsForBlinds[denom] || 0;
          if (distribution[denom] <= minRequired) continue;
          
          // Check if removing this chip and adding base units helps
          // We need: remove denom, add (denom/baseUnit) base units, net change should help with gap
          const baseUnitsFromSwap = denom / baseUnit;
          const netChange = baseUnitsFromSwap * baseUnit - denom; // Should be 0 for exact multiples
          
          // Actually, for exact multiples, net change is 0, so this won't help with gap
          // But we could remove a larger multiple and add smaller multiples
          // Example: remove 1×25 (25), add 5×5s (25), net 0, but gives us more 5s
          // Then we might be able to use those 5s differently
          
          // Actually, a better approach: if gap = 5, and we have 10s, remove 1×10, add 2×5s
          // But we can't add more 5s if we've hit the limit
          
          // So the real solution: we need to ensure we don't remove all 10s during reduction
          // Let me check if we can preserve at least one 10 for this kind of swap
        }
      }
    }
  }
  
  return distribution;
}


