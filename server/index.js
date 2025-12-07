import express from 'express';
import cors from 'cors';
import pg from 'pg';
import { config } from 'dotenv';

config();

const { Pool } = pg;

const app = express();
app.use(cors());
app.use(express.json());

// Database connection - replace with your URI
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/poker_tournament'
});

// Chip set configuration
const CHIP_SET = {
  10: 150,
  20: 100,
  50: 100,
  100: 100,
  500: 50
};

// Speed configurations (timing only, blinds are generated dynamically)
const SPEED_CONFIG = {
  turbo: {
    levelMinutes: 10,
    breakFrequency: 6, // break every 6 levels
    breakMinutes: 10
  },
  normal: {
    levelMinutes: 20,
    breakFrequency: 4,
    breakMinutes: 15
  },
  slow: {
    levelMinutes: 30,
    breakFrequency: 3,
    breakMinutes: 20
  }
};

// Get available chip denominations sorted in descending order
function getAvailableDenominations() {
  return Object.keys(CHIP_SET)
    .map(Number)
    .sort((a, b) => b - a);
}


// Floor a value to 2 significant digits (e.g., 1234 -> 1200, 123 -> 120, 31 -> 30)
// Ensures the last digit is always 0 (multiples of 10)
function floorTo2SignificantDigits(value) {
  if (value === 0) return 0;
  if (value < 1) return Math.floor(value * 100) / 100;
  
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const normalized = value / magnitude;
  const floored = Math.floor(normalized * 10) / 10;
  let result = floored * magnitude;
  
  // Ensure result is a multiple of 10 for values >= 10
  // This ensures 31 -> 30, not 31
  if (result >= 10) {
    result = Math.floor(result / 10) * 10;
  }
  
  return Math.floor(result);
}

// Generate blind structure dynamically based on starting stack, speed, starting blind depth, blind increase rate, and BBA start level
function generateBlindStructure(startingStack, speed, startingBlindDepth = 50, blindIncreaseRate = 1.25, bbaStartLevel = 6) {
  const config = SPEED_CONFIG[speed] || SPEED_CONFIG.normal;
  
  const levels = [];
  
  // Calculate initial big blind based on starting blind depth
  let currentBB = Math.floor(startingStack / startingBlindDepth);
  
  // Use provided blind increase rate, or fall back to speed-based defaults if not provided
  let increaseRate = parseFloat(blindIncreaseRate);
  if (isNaN(increaseRate) || increaseRate <= 1) {
    // Fallback to speed-based progression if invalid
    const progressionFactors = {
      turbo: 1.4,
      normal: 1.25,
      slow: 1.2
    };
    increaseRate = progressionFactors[speed] || progressionFactors.normal;
  }
  
  // Generate levels until we reach very high blinds (2x starting stack)
  // This ensures the tournament has enough levels for proper play, even in deep stack scenarios
  // No level cap - continue until BB reaches 2x starting stack
  const maxBlind = startingStack * 2;
  let level = 0;
  let previousBB = 0;
  
  while (currentBB < maxBlind) {
    // Floor BB to 2 significant digits
    currentBB = floorTo2SignificantDigits(currentBB);
    
    // Ensure blind always increases by at least one step (minimum increment of 10)
    // If the floored value is the same as previous, increment to next multiple of 10
    if (level > 0 && currentBB <= previousBB) {
      // Find the next multiple of 10 that's greater than previousBB
      const nextMultiple = Math.floor(previousBB / 10) * 10 + 10;
      currentBB = nextMultiple;
    }
    
    // Small blind is half of big blind, also floored to 2 significant digits
    const sb = floorTo2SignificantDigits(currentBB / 2);
    
    // Add BBA (Big Blind Ante) starting from specified level
    let ante = 0;
    const levelNumber = level + 1; // Level numbers are 1-indexed
    if (levelNumber >= bbaStartLevel) {
      // Ante equals the big blind
      ante = currentBB;
    }
    
    levels.push({
      sb: sb,
      bb: currentBB,
      ante: ante
    });
    
    // Store current BB before calculating next
    previousBB = currentBB;
    
    // Calculate next BB: PreviousBB * IncreaseRate
    currentBB = currentBB * increaseRate;
    
    level++;
  }
  
  return {
    ...config,
    levels
  };
}

// Calculate maximum achievable starting stack based on chip availability
// This calculates what we can actually distribute given chip constraints
function calculateMaxAchievableStack(maxPlayers, maxReentries = 0) {
  const denominations = getAvailableDenominations().sort((a, b) => b - a);
  const maxPossibleEntries = maxPlayers * (maxReentries + 1);
  
  // Calculate maximum chips available per entry for each denomination
  let maxStack = 0;
  for (const denom of denominations) {
    const maxChipsPerEntry = Math.floor(CHIP_SET[denom] / maxPossibleEntries);
    maxStack += maxChipsPerEntry * denom;
  }
  
  // Round down to nearest 10 to account for distribution inefficiencies
  // This ensures we can actually reach the target with the distribution algorithm
  // while still being reasonably close to the theoretical maximum
  return Math.floor(maxStack / 10) * 10;
}

// Calculate starting stack based on players and reentries
// Now uses achievable stack calculation to ensure it's actually distributable
function calculateStartingStack(maxPlayers, maxReentries = 0) {
  // Calculate maximum achievable stack given chip constraints
  const maxAchievableStack = calculateMaxAchievableStack(maxPlayers, maxReentries);
  
  // Also calculate theoretical maximum based on total chip value
  const totalChipValue = Object.entries(CHIP_SET).reduce((sum, [value, count]) => {
    return sum + (parseInt(value) * count);
  }, 0);
  
  const maxPossibleEntries = maxPlayers * (maxReentries + 1);
  const theoreticalPerEntry = Math.floor(totalChipValue / maxPossibleEntries);
  
  // Use the minimum of achievable and theoretical
  // This ensures we don't set a starting stack higher than what we can actually distribute
  const perEntry = Math.min(maxAchievableStack, theoreticalPerEntry);
  
  // Round down to nearest 100 for cleaner numbers, but ensure we don't go below achievable
  const roundedStack = Math.floor(perEntry / 100) * 100;
  const finalStack = Math.min(roundedStack, maxAchievableStack);
  
  // Ensure minimum of smallest chip denomination
  const smallestDenom = Math.min(...Object.keys(CHIP_SET).map(Number));
  return Math.max(smallestDenom, finalStack);
}

// Calculate chip distribution for starting stack, accounting for blind levels
function calculateChipDistribution(startingStack, numPlayers, blindStructure = null, maxReentries = 0) {
  const distribution = {};
  const denominations = getAvailableDenominations().sort((a, b) => b - a);
  const smallestDenom = Math.min(...denominations);
  const sortedDenomsAsc = [...denominations].sort((a, b) => a - b);
  
  // Calculate total possible entries (initial entries + reentries)
  const maxPossibleEntries = numPlayers * (maxReentries + 1);
  
  // Calculate minimum chips needed for early blinds (first 10-15 levels)
  let minChipsForBlinds = {};
  if (blindStructure && blindStructure.levels && blindStructure.levels.length > 0) {
    // Look at more early levels to determine minimum chip requirements
    // Consider first 12 levels to ensure enough chips for early game
    const earlyLevels = blindStructure.levels.slice(0, Math.min(12, blindStructure.levels.length));
    
    // For each early level, calculate what chips are needed to pay the blind
    for (const level of earlyLevels) {
      const totalNeeded = level.bb + level.sb + (level.ante || 0);
      let remaining = totalNeeded;
      
      // Calculate chips needed to make this amount (greedy approach)
      const tempChips = {};
      for (const denom of denominations) {
        if (remaining >= denom) {
          const count = Math.floor(remaining / denom);
          tempChips[denom] = (tempChips[denom] || 0) + count;
          remaining -= count * denom;
        }
      }
      
      // Update minimum requirements
      for (const [denom, count] of Object.entries(tempChips)) {
        minChipsForBlinds[denom] = Math.max(minChipsForBlinds[denom] || 0, count);
      }
    }
    
    // Add buffer: players need to pay blinds multiple times (at least 5-8 times)
    // before they can make change with larger chips, so multiply small chip requirements
    const bufferMultiplier = 6; // Enough for 6 blind payments
    for (const denom of sortedDenomsAsc) {
      if (minChipsForBlinds[denom] && denom <= 100) {
        // Apply buffer multiplier to smaller denominations (10, 20, 50, 100)
        minChipsForBlinds[denom] = Math.ceil(minChipsForBlinds[denom] * bufferMultiplier);
      }
    }
  }
  
  // First pass: Allocate minimum chips needed for blinds (constrained by available chips and remaining stack)
  let remaining = startingStack;
  
  // Allocate minimum chips for blinds from smallest to largest
  for (const denom of sortedDenomsAsc) {
    if (denom > remaining) continue;
    
    const minNeeded = minChipsForBlinds[denom] || 0;
    if (minNeeded > 0) {
      // Calculate max chips available per entry based on total chip set and max possible entries
      const maxChipsAvailable = Math.floor(CHIP_SET[denom] / maxPossibleEntries);
      // Constrain by: minimum needed, chips available, and what we can afford with remaining stack
      const chipsToAllocate = Math.min(
        minNeeded,
        maxChipsAvailable,
        Math.floor(remaining / denom)
      );
      
      if (chipsToAllocate > 0) {
        distribution[denom] = chipsToAllocate;
        remaining -= chipsToAllocate * denom;
      }
    }
  }
  
  // Second pass: Fill remaining stack with larger denominations (highest to lowest)
  // This pass tries to use up the remaining stack as completely as possible
  for (const denom of denominations) {
    if (denom > remaining) continue;
    
    // Calculate max chips available per entry based on total chip set and max possible entries
    const maxChipsAvailable = Math.floor(CHIP_SET[denom] / maxPossibleEntries);
    const alreadyAllocated = distribution[denom] || 0;
    const chipsAvailable = maxChipsAvailable - alreadyAllocated;
    
    if (chipsAvailable > 0 && remaining >= denom) {
      // Try to add as many chips as possible, up to what we need for remaining stack
      const chipsNeeded = Math.floor(remaining / denom);
      const chipsToAdd = Math.min(
        chipsAvailable,
        chipsNeeded
      );
      
      if (chipsToAdd > 0) {
        distribution[denom] = (distribution[denom] || 0) + chipsToAdd;
        remaining -= chipsToAdd * denom;
      }
    }
  }
  
  // Third pass: Handle any remaining amount, trying all denominations from smallest to largest
  if (remaining > 0) {
    for (const denom of sortedDenomsAsc) {
      if (remaining <= 0) break;
      if (denom > remaining) continue;
      
      // Calculate max chips available per entry based on total chip set and max possible entries
      const maxChipsAvailable = Math.floor(CHIP_SET[denom] / maxPossibleEntries);
      const alreadyAllocated = distribution[denom] || 0;
      const chipsAvailable = maxChipsAvailable - alreadyAllocated;
      
      if (chipsAvailable > 0) {
        // Use Math.floor to avoid exceeding the starting stack
        const chipsToAdd = Math.min(
          chipsAvailable,
          Math.floor(remaining / denom)
        );
        
        if (chipsToAdd > 0) {
          distribution[denom] = (distribution[denom] || 0) + chipsToAdd;
          remaining -= chipsToAdd * denom;
        }
      }
    }
  }
  
  // Calculate current total
  let totalDistributed = Object.entries(distribution).reduce((sum, [denom, count]) => {
    return sum + (parseInt(denom) * count);
  }, 0);
  
  // Fourth pass: Try to fill any remaining gap by adding more chips
  // This pass is more aggressive and tries multiple rounds to fill the gap
  let gap = startingStack - totalDistributed;
  let maxIterations = 20; // Allow more iterations to fill the gap
  let iterations = 0;
  
  while (gap > 0 && iterations < maxIterations) {
    iterations++;
    let gapBefore = gap;
    let madeProgress = false;
    
    // Try to fill the gap by adding chips, starting from smallest denomination
    for (const denom of sortedDenomsAsc) {
      if (gap <= 0) break;
      if (denom > gap + smallestDenom) continue; // Allow slightly larger denominations if close
      
      const maxChipsAvailable = Math.floor(CHIP_SET[denom] / maxPossibleEntries);
      const alreadyAllocated = distribution[denom] || 0;
      const chipsAvailable = maxChipsAvailable - alreadyAllocated;
      
      if (chipsAvailable > 0) {
        // Calculate how many chips we can add to help fill the gap
        // Use Math.ceil to try to get closer to the target
        const chipsNeeded = Math.ceil(gap / denom);
        let chipsToAdd = Math.min(
          chipsAvailable,
          chipsNeeded
        );
        
        // If we're close to the target, try adding one more chip even if it slightly exceeds
        // (we'll correct for excess in the validation step)
        if (gap > 0 && gap < denom && chipsAvailable > 0) {
          // Gap is smaller than this denomination, but adding one chip might help
          // if we can then remove smaller chips to correct
          chipsToAdd = Math.min(chipsAvailable, 1);
        }
        
        if (chipsToAdd > 0) {
          const valueToAdd = chipsToAdd * denom;
          // Allow adding even if it slightly exceeds - we'll correct later
          if (totalDistributed + valueToAdd <= startingStack + smallestDenom) {
            distribution[denom] = (distribution[denom] || 0) + chipsToAdd;
            totalDistributed += valueToAdd;
            gap = startingStack - totalDistributed;
            madeProgress = true;
          }
        }
      }
    }
    
    // If we didn't make progress, break to avoid infinite loop
    if (!madeProgress && gap >= gapBefore) {
      break;
    }
  }
  
  // Fifth pass: If there's still a gap and we have room, try using larger denominations
  // that we might have skipped, working backwards
  gap = startingStack - totalDistributed;
  if (gap > 0) {
    // Try larger denominations that might help, even if they exceed the gap slightly
    // We'll correct for excess later
    for (const denom of denominations) {
      if (gap <= 0) break;
      
      const maxChipsAvailable = Math.floor(CHIP_SET[denom] / maxPossibleEntries);
      const alreadyAllocated = distribution[denom] || 0;
      const chipsAvailable = maxChipsAvailable - alreadyAllocated;
      
      // If the gap is close to this denomination, try adding one chip
      if (chipsAvailable > 0 && gap >= denom * 0.5) {
        const chipsToAdd = Math.min(chipsAvailable, 1);
        if (chipsToAdd > 0) {
          distribution[denom] = (distribution[denom] || 0) + chipsToAdd;
          totalDistributed += chipsToAdd * denom;
          gap = startingStack - totalDistributed;
        }
      }
    }
  }
  
  // Recalculate total after all passes
  totalDistributed = Object.entries(distribution).reduce((sum, [denom, count]) => {
    return sum + (parseInt(denom) * count);
  }, 0);
  
  // Final optimization: If we're still short, try to optimize by swapping chips
  // This tries to use available chip capacity more efficiently
  gap = startingStack - totalDistributed;
  if (gap > 0 && gap < smallestDenom * 10) { // Only if gap is reasonably small
    // Try to add one more chip of a larger denomination if it helps
    // and we have capacity, even if it slightly exceeds (we'll correct)
    for (const denom of denominations) {
      if (gap <= 0) break;
      
      const maxChipsAvailable = Math.floor(CHIP_SET[denom] / maxPossibleEntries);
      const alreadyAllocated = distribution[denom] || 0;
      const chipsAvailable = maxChipsAvailable - alreadyAllocated;
      
      // If adding one chip of this denomination gets us closer to target
      if (chipsAvailable > 0 && denom <= gap + smallestDenom) {
        distribution[denom] = (distribution[denom] || 0) + 1;
        totalDistributed += denom;
        gap = startingStack - totalDistributed;
        break; // Only add one chip at a time in this pass
      }
    }
  }
  
  // Validate and correct: ensure total doesn't exceed starting stack
  totalDistributed = Object.entries(distribution).reduce((sum, [denom, count]) => {
    return sum + (parseInt(denom) * count);
  }, 0);
  
  // If we exceeded, remove chips starting from smallest denomination
  if (totalDistributed > startingStack) {
    let excess = totalDistributed - startingStack;
    const sortedDenomsAscForAdjust = [...denominations].sort((a, b) => a - b);
    
    for (const denom of sortedDenomsAscForAdjust) {
      if (excess <= 0) break;
      if (!distribution[denom] || distribution[denom] === 0) continue;
      
      // Calculate how many chips we need to remove to cover the excess
      const chipsToRemove = Math.min(
        distribution[denom],
        Math.ceil(excess / denom)
      );
      
      if (chipsToRemove > 0) {
        const valueRemoved = chipsToRemove * denom;
        distribution[denom] -= chipsToRemove;
        excess -= valueRemoved;
        totalDistributed -= valueRemoved;
        
        if (distribution[denom] === 0) {
          delete distribution[denom];
        }
      }
    }
  }
  
  return distribution;
}

// Initialize database
async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS tournaments (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        speed VARCHAR(20) NOT NULL DEFAULT 'normal',
        max_players INTEGER NOT NULL DEFAULT 10,
        max_reentries INTEGER NOT NULL DEFAULT 1,
        type VARCHAR(20) NOT NULL DEFAULT 'icm',
        entry_price DECIMAL(10,2) NOT NULL DEFAULT 10.00,
        starting_stack INTEGER NOT NULL DEFAULT 10000,
        starting_blind_depth INTEGER NOT NULL DEFAULT 50,
        blind_increase_rate DECIMAL(5,2) NOT NULL DEFAULT 1.25,
        bba_start_level INTEGER NOT NULL DEFAULT 6,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        current_level INTEGER NOT NULL DEFAULT 1,
        level_start_time TIMESTAMP,
        pause_time TIMESTAMP,
        elapsed_before_pause INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      -- Add columns if they don't exist (for existing databases)
      DO \$\$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'tournaments' AND column_name = 'starting_blind_depth'
        ) THEN
          ALTER TABLE tournaments ADD COLUMN starting_blind_depth INTEGER NOT NULL DEFAULT 50;
        END IF;
        
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'tournaments' AND column_name = 'blind_increase_rate'
        ) THEN
          ALTER TABLE tournaments ADD COLUMN blind_increase_rate DECIMAL(5,2) NOT NULL DEFAULT 1.25;
        END IF;
        
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'tournaments' AND column_name = 'bba_start_level'
        ) THEN
          ALTER TABLE tournaments ADD COLUMN bba_start_level INTEGER NOT NULL DEFAULT 6;
        END IF;
      END \$\$;
      
      CREATE TABLE IF NOT EXISTS entries (
        id SERIAL PRIMARY KEY,
        tournament_id INTEGER REFERENCES tournaments(id) ON DELETE CASCADE,
        player_name VARCHAR(255) NOT NULL,
        entry_number INTEGER NOT NULL DEFAULT 1,
        is_eliminated BOOLEAN DEFAULT FALSE,
        eliminated_at TIMESTAMP,
        bounty_collected DECIMAL(10,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS knockouts (
        id SERIAL PRIMARY KEY,
        tournament_id INTEGER REFERENCES tournaments(id) ON DELETE CASCADE,
        eliminator_entry_id INTEGER REFERENCES entries(id),
        eliminated_entry_id INTEGER REFERENCES entries(id),
        bounty_amount DECIMAL(10,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Database initialized');
  } finally {
    client.release();
  }
}

// API Routes

// Get all tournaments
app.get('/api/tournaments', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM tournaments ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get single tournament with full details
app.get('/api/tournaments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const tournamentResult = await pool.query(
      'SELECT * FROM tournaments WHERE id = $1',
      [id]
    );
    
    if (tournamentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Tournament not found' });
    }
    
    const tournament = tournamentResult.rows[0];
    
    // Get entries
    const entriesResult = await pool.query(
      'SELECT * FROM entries WHERE tournament_id = $1 ORDER BY created_at',
      [id]
    );
    
    // Get knockouts
    const knockoutsResult = await pool.query(`
      SELECT k.*, 
             e1.player_name as eliminator_name,
             e2.player_name as eliminated_name
      FROM knockouts k
      LEFT JOIN entries e1 ON k.eliminator_entry_id = e1.id
      LEFT JOIN entries e2 ON k.eliminated_entry_id = e2.id
      WHERE k.tournament_id = $1
      ORDER BY k.created_at DESC
    `, [id]);
    
    // Calculate stats
    const entries = entriesResult.rows;
    const activeEntries = entries.filter(e => !e.is_eliminated).length;
    const totalEntries = entries.length;
    const totalPrizePool = totalEntries * parseFloat(tournament.entry_price);
    const averageStack = activeEntries > 0 
      ? Math.floor((totalEntries * tournament.starting_stack) / activeEntries)
      : tournament.starting_stack;
    
    // Get blind structure (generated dynamically based on starting stack, blind depth, increase rate, and BBA start level)
    const startingBlindDepth = tournament.starting_blind_depth || 50; // Default to 50BB for existing tournaments
    const blindIncreaseRate = tournament.blind_increase_rate || 1.25; // Default to 1.25x for existing tournaments
    const bbaStartLevel = tournament.bba_start_level || 6; // Default to level 6 for existing tournaments
    const structure = generateBlindStructure(tournament.starting_stack, tournament.speed, startingBlindDepth, blindIncreaseRate, bbaStartLevel);
    const currentBlind = structure.levels[tournament.current_level - 1] || structure.levels[0];
    const nextBlind = structure.levels[tournament.current_level] || null;
    
    // Calculate time remaining in level
    let timeRemaining = structure.levelMinutes * 60;
    if (tournament.status === 'running' && tournament.level_start_time) {
      const elapsed = Math.floor((Date.now() - new Date(tournament.level_start_time).getTime()) / 1000);
      timeRemaining = Math.max(0, (structure.levelMinutes * 60) - elapsed);
    } else if (tournament.status === 'paused') {
      timeRemaining = (structure.levelMinutes * 60) - (tournament.elapsed_before_pause || 0);
    }
    
    // Check if it's break time
    const isBreak = tournament.current_level > 0 && 
                    tournament.current_level % structure.breakFrequency === 0;
    
    // Calculate chip distribution
    const chipDistribution = calculateChipDistribution(
      tournament.starting_stack, 
      tournament.max_players,
      structure,
      tournament.max_reentries || 0
    );
    
    res.json({
      ...tournament,
      entries,
      knockouts: knockoutsResult.rows,
      chipDistribution,
      blindStructure: {
        levels: structure.levels,
        levelMinutes: structure.levelMinutes,
        breakFrequency: structure.breakFrequency,
        breakMinutes: structure.breakMinutes
      },
      stats: {
        activeEntries,
        totalEntries,
        totalPrizePool,
        averageStack,
        currentBlind,
        nextBlind,
        timeRemaining,
        levelMinutes: structure.levelMinutes,
        isBreak,
        breakMinutes: structure.breakMinutes
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Create tournament
app.post('/api/tournaments', async (req, res) => {
  try {
    const { name, speed, max_players, max_reentries, type, entry_price, starting_blind_depth, blind_increase_rate, bba_start_level } = req.body;
    
    const startingStack = calculateStartingStack(max_players, max_reentries || 0);
    const blindDepth = starting_blind_depth || 50; // Default to 50BB if not provided
    const increaseRate = blind_increase_rate || 1.25; // Default to 1.25x if not provided
    const bbaStart = bba_start_level || 6; // Default to level 6 if not provided
    
    const result = await pool.query(
      `INSERT INTO tournaments (name, speed, max_players, max_reentries, type, entry_price, starting_stack, starting_blind_depth, blind_increase_rate, bba_start_level)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [name, speed, max_players, max_reentries, type, entry_price, startingStack, blindDepth, increaseRate, bbaStart]
    );
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get tournament config preview
app.post('/api/tournaments/preview', (req, res) => {
  const { speed, max_players, max_reentries, entry_price, starting_blind_depth, blind_increase_rate, bba_start_level } = req.body;
  
  const startingStack = calculateStartingStack(max_players, max_reentries || 0);
  const blindDepth = starting_blind_depth || 50; // Default to 50BB if not provided
  const increaseRate = blind_increase_rate || 1.25; // Default to 1.25x if not provided
  const bbaStart = bba_start_level || 6; // Default to level 6 if not provided
  const structure = generateBlindStructure(startingStack, speed, blindDepth, increaseRate, bbaStart);
  const chipDistribution = calculateChipDistribution(startingStack, max_players, structure, max_reentries || 0);
  
  // Calculate max possible entries for prize pool
  const maxPossibleEntries = max_players * ((max_reentries || 0) + 1);
  
  res.json({
    startingStack,
    levelMinutes: structure.levelMinutes,
    breakFrequency: structure.breakFrequency,
    breakMinutes: structure.breakMinutes,
    blindLevels: structure.levels, // Return all levels, no limit
    chipDistribution,
    estimatedDuration: `${Math.floor(structure.levels.length * structure.levelMinutes / 60)}+ hours`,
    prizePool: maxPossibleEntries * entry_price
  });
});

// Update tournament status
app.patch('/api/tournaments/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    const tournament = await pool.query('SELECT * FROM tournaments WHERE id = $1', [id]);
    if (tournament.rows.length === 0) {
      return res.status(404).json({ error: 'Tournament not found' });
    }
    
    const current = tournament.rows[0];
    let updateQuery = '';
    let params = [];
    
    if (status === 'running') {
      if (current.status === 'paused') {
        // Resume from pause
        updateQuery = `
          UPDATE tournaments 
          SET status = $1, level_start_time = NOW() - (elapsed_before_pause || '0 seconds')::interval
          WHERE id = $2
          RETURNING *
        `;
        params = [status, id];
      } else {
        // Fresh start
        updateQuery = `
          UPDATE tournaments 
          SET status = $1, level_start_time = NOW(), elapsed_before_pause = 0
          WHERE id = $2
          RETURNING *
        `;
        params = [status, id];
      }
    } else if (status === 'paused') {
      // Calculate elapsed time before pause
      updateQuery = `
        UPDATE tournaments 
        SET status = $1, 
            elapsed_before_pause = EXTRACT(EPOCH FROM (NOW() - level_start_time))::INTEGER,
            pause_time = NOW()
        WHERE id = $2
        RETURNING *
      `;
      params = [status, id];
    } else {
      updateQuery = 'UPDATE tournaments SET status = $1 WHERE id = $2 RETURNING *';
      params = [status, id];
    }
    
    const result = await pool.query(updateQuery, params);
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Advance to next level
app.patch('/api/tournaments/:id/next-level', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      `UPDATE tournaments 
       SET current_level = current_level + 1, 
           level_start_time = NOW(),
           elapsed_before_pause = 0
       WHERE id = $1
       RETURNING *`,
      [id]
    );
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Add entry
app.post('/api/tournaments/:id/entries', async (req, res) => {
  try {
    const { id } = req.params;
    const { player_name } = req.body;
    
    // Check existing entries for this player
    const existingResult = await pool.query(
      'SELECT * FROM entries WHERE tournament_id = $1 AND player_name = $2',
      [id, player_name]
    );
    
    // Get tournament to check max reentries
    const tournamentResult = await pool.query(
      'SELECT * FROM tournaments WHERE id = $1',
      [id]
    );
    
    if (tournamentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Tournament not found' });
    }
    
    const tournament = tournamentResult.rows[0];
    const existingEntries = existingResult.rows;
    const entryNumber = existingEntries.length + 1;
    
    if (existingEntries.length > 0 && entryNumber > tournament.max_reentries + 1) {
      return res.status(400).json({ error: 'Max reentries reached for this player' });
    }
    
    const result = await pool.query(
      `INSERT INTO entries (tournament_id, player_name, entry_number)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [id, player_name, entryNumber]
    );
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Record knockout
app.post('/api/tournaments/:id/knockouts', async (req, res) => {
  try {
    const { id } = req.params;
    const { eliminator_entry_id, eliminated_entry_id } = req.body;
    
    // Get tournament type for bounty calculation
    const tournamentResult = await pool.query(
      'SELECT * FROM tournaments WHERE id = $1',
      [id]
    );
    
    const tournament = tournamentResult.rows[0];
    let bountyAmount = 0;
    
    if (tournament.type === 'ko' || tournament.type === 'mystery_ko') {
      bountyAmount = parseFloat(tournament.entry_price) * 0.5; // 50% bounty
      
      if (tournament.type === 'mystery_ko') {
        // Random bounty multiplier for mystery KO
        const multipliers = [0.5, 1, 1, 1, 1, 2, 2, 3, 5, 10];
        const randomMultiplier = multipliers[Math.floor(Math.random() * multipliers.length)];
        bountyAmount *= randomMultiplier;
      }
    }
    
    // Mark entry as eliminated
    await pool.query(
      'UPDATE entries SET is_eliminated = TRUE, eliminated_at = NOW() WHERE id = $1',
      [eliminated_entry_id]
    );
    
    // Update bounty collected for eliminator
    if (bountyAmount > 0) {
      await pool.query(
        'UPDATE entries SET bounty_collected = bounty_collected + $1 WHERE id = $2',
        [bountyAmount, eliminator_entry_id]
      );
    }
    
    // Record knockout
    const result = await pool.query(
      `INSERT INTO knockouts (tournament_id, eliminator_entry_id, eliminated_entry_id, bounty_amount)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [id, eliminator_entry_id, eliminated_entry_id, bountyAmount]
    );
    
    res.json({ ...result.rows[0], bountyAmount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Delete tournament
app.delete('/api/tournaments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM tournaments WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get blind structure
app.get('/api/blind-structure/:speed', (req, res) => {
  const { speed } = req.params;
  const { starting_stack, starting_blind_depth, blind_increase_rate, bba_start_level } = req.query;
  
  // Use provided starting_stack or default to 10000
  const startingStack = starting_stack ? parseInt(starting_stack) : 10000;
  const blindDepth = starting_blind_depth ? parseInt(starting_blind_depth) : 50;
  const increaseRate = blind_increase_rate ? parseFloat(blind_increase_rate) : 1.25;
  const bbaStart = bba_start_level ? parseInt(bba_start_level) : 6;
  const structure = generateBlindStructure(startingStack, speed, blindDepth, increaseRate, bbaStart);
  res.json(structure);
});

const PORT = process.env.PORT || 3001;

initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});

