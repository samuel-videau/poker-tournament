import express from 'express';
import cors from 'cors';
import pg from 'pg';
import { config } from 'dotenv';
import { calculateChipDistribution } from './utils/chipDistribution.js';
import { calculateBountyAmount, getBountyAsInteger } from './utils/bountyCalculation.js';

config();

const { Pool } = pg;

const app = express();
app.use(cors());
app.use(express.json());

// Database connection - replace with your URI
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/poker_tournament'
});

// Import chip set configuration (also exported from chipDistribution.js)
import { CHIP_SET } from './utils/chipDistribution.js';

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

// Round a blind value to the nearest valid value based on available chip denominations
// This ensures blinds can be paid with the available chips
function roundToValidBlind(value) {
  if (value === 0) return 0;
  
  const denominations = getAvailableDenominations();
  const baseUnit = getChipBaseUnit();
  const smallestDenom = Math.min(...denominations);
  
  // Start with rounding to the base unit (e.g., if chips are 5, 25, then base unit is 5)
  let rounded = Math.round(value / baseUnit) * baseUnit;
  
  // Try to round to a "nicer" number that's a multiple of larger denominations
  // This makes blinds more practical (e.g., prefer 25/50 over 23/46)
  // Sort denominations in descending order once
  const sortedDenoms = [...denominations].sort((a, b) => b - a);
  
  for (const denom of sortedDenoms) {
    if (denom <= value) {
      // Check if rounding to a multiple of this denomination gets us closer
      const lowerMultiple = Math.floor(value / denom) * denom;
      const upperMultiple = Math.ceil(value / denom) * denom;
      
      // Choose the multiple that's closer to the original value
      const candidate = (value - lowerMultiple < upperMultiple - value) ? lowerMultiple : upperMultiple;
      
      // Use this candidate if it's within a reasonable range (within 20% of original)
      if (Math.abs(candidate - value) / value <= 0.2) {
        rounded = candidate;
        break;
      }
    }
  }
  
  // Ensure we don't go below the smallest denomination
  if (rounded > 0 && rounded < smallestDenom) {
    rounded = smallestDenom;
  }
  
  return Math.floor(rounded);
}

// Floor a value to 2 significant digits (e.g., 1234 -> 1200, 123 -> 120, 31 -> 30)
// Ensures the last digit is always 0 (multiples of 10)
// DEPRECATED: Use roundToValidBlind instead for chip-aware rounding
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
  const baseUnit = getChipBaseUnit();
  
  while (currentBB < maxBlind) {
    // Round BB to a valid value based on available chip denominations
    currentBB = roundToValidBlind(currentBB);
    
    // Ensure blind always increases by at least one base unit
    // If the rounded value is the same as previous, increment by base unit
    if (level > 0 && currentBB <= previousBB) {
      // Find the next multiple of base unit that's greater than previousBB
      const nextMultiple = Math.floor(previousBB / baseUnit) * baseUnit + baseUnit;
      currentBB = nextMultiple;
    }
    
    // Small blind is half of big blind, also rounded to valid chip values
    const sb = roundToValidBlind(currentBB / 2);
    
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

// Calculate ICM payout distribution
// Returns an array of prize amounts for each position (1st, 2nd, 3rd, etc.)
function calculateICMPayouts(totalPlayers, payoutPercentage, payoutStructure, prizePool, entryPrice = 0) {
  // Calculate how many players get paid (top X%)
  const numWinners = Math.max(1, Math.floor(totalPlayers * (payoutPercentage / 100)));
  
  // If winner takes all, first gets (prize pool - 1 buy-in), second gets 1 buy-in back
  if (payoutStructure === 'winner_takes_all') {
    const payouts = new Array(totalPlayers).fill(0);
    if (totalPlayers > 0) {
      // First place gets prize pool minus one buy-in
      payouts[0] = Math.max(0, prizePool - entryPrice);
      // Second place gets their buy-in back (if there are at least 2 players)
      if (totalPlayers >= 2 && entryPrice > 0) {
        payouts[1] = entryPrice;
      }
    }
    return payouts;
  }
  
  // Calculate payout percentages based on structure
  let payoutPercentages = [];
  
  if (payoutStructure === 'flat') {
    // Equal distribution among all winners
    const equalShare = 100 / numWinners;
    payoutPercentages = new Array(numWinners).fill(equalShare);
  } else if (payoutStructure === 'steep') {
    // Steep: 60/25/15 for top 3, then distribute remaining
    if (numWinners === 1) {
      payoutPercentages = [100];
    } else if (numWinners === 2) {
      payoutPercentages = [65, 35];
    } else if (numWinners === 3) {
      payoutPercentages = [60, 25, 15];
    } else {
      // For more than 3, use steep distribution for top 3, then distribute remaining
      const top3Total = 60 + 25 + 15;
      const remaining = 100 - top3Total;
      payoutPercentages = [60, 25, 15];
      
      // Distribute remaining percentage among remaining positions
      const remainingPositions = numWinners - 3;
      if (remainingPositions > 0) {
        const remainingPerPosition = remaining / remainingPositions;
        for (let i = 0; i < remainingPositions; i++) {
          payoutPercentages.push(remainingPerPosition);
        }
      }
    }
  } else {
    // Standard: 50/30/20 for top 3, then distribute remaining
    if (numWinners === 1) {
      payoutPercentages = [100];
    } else if (numWinners === 2) {
      payoutPercentages = [60, 40];
    } else if (numWinners === 3) {
      payoutPercentages = [50, 30, 20];
    } else {
      // For more than 3, use standard distribution for top 3, then distribute remaining
      const top3Total = 50 + 30 + 20;
      const remaining = 100 - top3Total;
      payoutPercentages = [50, 30, 20];
      
      // Distribute remaining percentage among remaining positions
      const remainingPositions = numWinners - 3;
      if (remainingPositions > 0) {
        const remainingPerPosition = remaining / remainingPositions;
        for (let i = 0; i < remainingPositions; i++) {
          payoutPercentages.push(remainingPerPosition);
        }
      }
    }
  }
  
  // Normalize percentages to ensure they sum to 100
  const totalPercent = payoutPercentages.reduce((sum, p) => sum + p, 0);
  if (totalPercent !== 100) {
    payoutPercentages = payoutPercentages.map(p => (p / totalPercent) * 100);
  }
  
  // Calculate actual prize amounts - use exact calculations, round only at the end
  const payouts = new Array(totalPlayers).fill(0);
  
  // Calculate all payouts based on percentages
  for (let i = 0; i < numWinners && i < payoutPercentages.length; i++) {
    payouts[i] = (prizePool * payoutPercentages[i]) / 100;
  }
  
  // Calculate total of calculated payouts
  let calculatedTotal = payouts.reduce((sum, p) => sum + p, 0);
  
  // Adjust to ensure exact match with prize pool
  const diff = prizePool - calculatedTotal;
  if (Math.abs(diff) > 0.0001) { // Only adjust if there's a meaningful difference
    // Add difference to first place to ensure total matches exactly
    if (payouts[0] > 0) {
      payouts[0] += diff;
    }
  }
  
  // Round to 2 decimal places for display/storage
  for (let i = 0; i < payouts.length; i++) {
    payouts[i] = Math.round(payouts[i] * 100) / 100;
  }
  
  // Final verification: ensure total matches prize pool exactly after rounding
  const finalTotal = payouts.reduce((sum, p) => sum + p, 0);
  const finalDiff = prizePool - finalTotal;
  if (Math.abs(finalDiff) > 0.01) { // Adjust if rounding caused significant difference
    // Adjust first place to make up the difference
    if (payouts[0] > 0) {
      payouts[0] = Math.round((payouts[0] + finalDiff) * 100) / 100;
    }
  }
  
  return payouts;
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
        break_start_time TIMESTAMP,
        level_elapsed_before_break INTEGER DEFAULT 0,
        break_completed_level INTEGER,
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
        
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'tournaments' AND column_name = 'break_start_time'
        ) THEN
          ALTER TABLE tournaments ADD COLUMN break_start_time TIMESTAMP;
        END IF;
        
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'tournaments' AND column_name = 'level_elapsed_before_break'
        ) THEN
          ALTER TABLE tournaments ADD COLUMN level_elapsed_before_break INTEGER DEFAULT 0;
        END IF;
        
        -- Migrate break_completed_at to break_completed_level if it exists
        IF EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'tournaments' AND column_name = 'break_completed_at'
        ) THEN
          -- If break_completed_at exists, we need to migrate it
          -- For existing data, set break_completed_level to current_level if break_completed_at is set
          UPDATE tournaments 
          SET break_completed_level = current_level 
          WHERE break_completed_at IS NOT NULL AND break_completed_level IS NULL;
          
          ALTER TABLE tournaments DROP COLUMN break_completed_at;
        END IF;
        
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'tournaments' AND column_name = 'break_completed_level'
        ) THEN
          ALTER TABLE tournaments ADD COLUMN break_completed_level INTEGER;
        END IF;
        
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'tournaments' AND column_name = 'icm_payout_percentage'
        ) THEN
          ALTER TABLE tournaments ADD COLUMN icm_payout_percentage INTEGER NOT NULL DEFAULT 20;
        END IF;
        
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'tournaments' AND column_name = 'icm_payout_structure'
        ) THEN
          ALTER TABLE tournaments ADD COLUMN icm_payout_structure VARCHAR(20) NOT NULL DEFAULT 'standard';
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
    
    let tournament = tournamentResult.rows[0];
    
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
    let currentBlind = structure.levels[tournament.current_level - 1] || structure.levels[0];
    let nextBlind = structure.levels[tournament.current_level] || null;
    
    // Check if it's break time (break occurs at the START of a break level)
    // A break is active only if we're on a break level AND break_start_time is set AND break hasn't been completed for this level
    const isBreakLevel = tournament.current_level > 0 && 
                         tournament.current_level % structure.breakFrequency === 0;
    const isBreak = isBreakLevel && 
                     tournament.break_start_time !== null && 
                     tournament.break_completed_level !== tournament.current_level;
    
    // Calculate time remaining - handle breaks separately from regular levels
    let timeRemaining = structure.levelMinutes * 60;
    let breakTimeRemaining = 0;
    
    if (tournament.status === 'running') {
      if (isBreak && tournament.break_start_time) {
        // We're in a break - show break timer
        const breakElapsedResult = await pool.query(
          `SELECT EXTRACT(EPOCH FROM (NOW() - break_start_time))::INTEGER as elapsed
           FROM tournaments WHERE id = $1`,
          [id]
        );
        const breakElapsed = breakElapsedResult.rows[0]?.elapsed || 0;
        breakTimeRemaining = Math.max(0, (structure.breakMinutes * 60) - breakElapsed);
        
        // Level timer is paused during break - use the elapsed time before break started
        timeRemaining = Math.max(0, (structure.levelMinutes * 60) - (tournament.level_elapsed_before_break || 0));
        
        // Check if break timer has expired - if so, end the break and resume the level
        if (breakTimeRemaining <= 0) {
          // Break is over - resume the level timer from where it was paused
          const levelElapsedBeforeBreak = tournament.level_elapsed_before_break || 0;
          await pool.query(
            `UPDATE tournaments 
             SET break_start_time = NULL,
                 level_start_time = NOW() - ($2 || ' seconds')::INTERVAL,
                 level_elapsed_before_break = 0,
                 break_completed_level = $3
             WHERE id = $1`,
            [id, levelElapsedBeforeBreak, tournament.current_level]
          );
          
          // Refresh tournament data
          const updatedResult = await pool.query(
            'SELECT * FROM tournaments WHERE id = $1',
            [id]
          );
          if (updatedResult.rows.length > 0) {
            tournament = updatedResult.rows[0];
            // Recalculate time remaining for resumed level
            const elapsedResult = await pool.query(
              `SELECT EXTRACT(EPOCH FROM (NOW() - level_start_time))::INTEGER as elapsed
               FROM tournaments WHERE id = $1`,
              [id]
            );
            const elapsed = elapsedResult.rows[0]?.elapsed || 0;
            timeRemaining = Math.max(0, (structure.levelMinutes * 60) - elapsed);
            breakTimeRemaining = 0;
          }
        }
      } else if (isBreakLevel && !tournament.break_start_time && tournament.level_start_time && tournament.break_completed_level !== tournament.current_level) {
        // Just entered a break level - pause the level timer and start break timer
        // Only start break if break hasn't been completed for this level
        const levelElapsedResult = await pool.query(
          `SELECT EXTRACT(EPOCH FROM (NOW() - level_start_time))::INTEGER as elapsed
           FROM tournaments WHERE id = $1`,
          [id]
        );
        const levelElapsed = levelElapsedResult.rows[0]?.elapsed || 0;
        
        await pool.query(
          `UPDATE tournaments 
           SET break_start_time = NOW(),
               level_elapsed_before_break = $2
           WHERE id = $1`,
          [id, levelElapsed]
        );
        
        // Refresh tournament data
        const updatedResult = await pool.query(
          'SELECT * FROM tournaments WHERE id = $1',
          [id]
        );
        if (updatedResult.rows.length > 0) {
          tournament = updatedResult.rows[0];
        }
        
        // Set break timer
        breakTimeRemaining = structure.breakMinutes * 60;
        timeRemaining = Math.max(0, (structure.levelMinutes * 60) - levelElapsed);
      } else if (tournament.level_start_time && !isBreak) {
        // Normal level (or break level with break skipped) - calculate time remaining
        const elapsedResult = await pool.query(
          `SELECT EXTRACT(EPOCH FROM (NOW() - level_start_time))::INTEGER as elapsed
           FROM tournaments WHERE id = $1`,
          [id]
        );
        const elapsed = elapsedResult.rows[0]?.elapsed || 0;
        timeRemaining = Math.max(0, (structure.levelMinutes * 60) - elapsed);
        
        // Clear break_start_time if set (but keep break_completed_level to prevent restart)
        if (tournament.break_start_time) {
          await pool.query(
            `UPDATE tournaments 
             SET break_start_time = NULL
             WHERE id = $1`,
            [id]
          );
        }
      }
    } else if (tournament.status === 'paused') {
      // Tournament is paused - use stored elapsed time
      if (isBreak && tournament.break_start_time) {
        // Paused during break
        breakTimeRemaining = Math.max(0, (structure.breakMinutes * 60) - (tournament.elapsed_before_pause || 0));
        timeRemaining = Math.max(0, (structure.levelMinutes * 60) - (tournament.level_elapsed_before_break || 0));
      } else {
        // Paused during normal level
        timeRemaining = Math.max(0, (structure.levelMinutes * 60) - (tournament.elapsed_before_pause || 0));
      }
    }
    
    // Automatic level advancement when timer expires (only if tournament is running and NOT in break)
    if (tournament.status === 'running' && !isBreak && timeRemaining <= 0 && tournament.level_start_time) {
      // Verify the level hasn't just been advanced
      const timeSinceStartResult = await pool.query(
        `SELECT EXTRACT(EPOCH FROM (NOW() - level_start_time))::INTEGER as elapsed
         FROM tournaments WHERE id = $1`,
        [id]
      );
      const timeSinceStart = timeSinceStartResult.rows[0]?.elapsed || 0;
      
      // Only advance if the level has been running for at least the full duration
      if (timeSinceStart >= structure.levelMinutes * 60) {
        // Check if there are more levels available
        if (tournament.current_level < structure.levels.length) {
          // Automatically advance to next level
          await pool.query(
            `UPDATE tournaments 
             SET current_level = current_level + 1, 
                 level_start_time = NOW(),
                 elapsed_before_pause = 0,
                 break_start_time = NULL,
                 level_elapsed_before_break = 0
             WHERE id = $1`,
            [id]
          );
          
          // Refresh tournament data after advancement
          const updatedResult = await pool.query(
            'SELECT * FROM tournaments WHERE id = $1',
            [id]
          );
          if (updatedResult.rows.length > 0) {
            tournament = updatedResult.rows[0];
            // Recalculate time remaining for new level
            timeRemaining = structure.levelMinutes * 60;
            // Recalculate current and next blinds for the new level
            currentBlind = structure.levels[tournament.current_level - 1] || structure.levels[0];
            nextBlind = structure.levels[tournament.current_level] || null;
          }
        }
      }
    }
    
    // Calculate chip distribution
    const chipDistribution = calculateChipDistribution(
      tournament.starting_stack, 
      tournament.max_players,
      structure,
      tournament.max_reentries || 0
    );
    
    // Calculate leaderboard
    // Calculate total bounties paid (sum of all bounty amounts from knockouts)
    // Use utility function to ensure integers
    const totalBountiesPaid = knockoutsResult.rows.reduce((sum, ko) => {
      const bounty = getBountyAsInteger(ko.bounty_amount);
      return sum + bounty;
    }, 0);
    
    // Sort entries for leaderboard:
    // 1. Active players first (sorted by entry creation time, earliest first = better rank)
    // 2. Eliminated players (sorted by elimination time, most recent elimination = better rank)
    const activePlayers = entries.filter(e => !e.is_eliminated)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const eliminatedPlayers = entries.filter(e => e.is_eliminated)
      .sort((a, b) => new Date(b.eliminated_at || 0) - new Date(a.eliminated_at || 0));
    
    // Calculate actual bounties collected per player from knockouts table
    // This ensures accuracy and avoids rounding issues from stored bounty_collected field
    // Use utility function to ensure integers
    const bountiesByEntry = {};
    knockoutsResult.rows.forEach(ko => {
      const eliminatorId = ko.eliminator_entry_id;
      if (eliminatorId) {
        const bounty = getBountyAsInteger(ko.bounty_amount);
        bountiesByEntry[eliminatorId] = (bountiesByEntry[eliminatorId] || 0) + bounty;
      }
    });
    
    // Calculate ICM payouts if tournament is ended
    let icmPayouts = [];
    if (tournament.status === 'ended') {
      const payoutPercentage = tournament.icm_payout_percentage || 20;
      const payoutStructure = tournament.icm_payout_structure || 'standard';
      const totalPlayers = entries.length;
      
      const entryPrice = parseFloat(tournament.entry_price || 0);
      
      if (tournament.type === 'icm') {
        // For ICM tournaments: prize pool minus bounties goes to ICM
        const prizePoolAvailable = Math.max(0, totalPrizePool - totalBountiesPaid);
        icmPayouts = calculateICMPayouts(totalPlayers, payoutPercentage, payoutStructure, prizePoolAvailable, entryPrice);
      } else if (tournament.type === 'ko') {
        // For KO tournaments: ICM prize pool = total prize pool - bounties actually paid
        // The winner's bounty (never collected) goes to the ICM pool
        const icmPrizePool = Math.max(0, totalPrizePool - totalBountiesPaid);
        icmPayouts = calculateICMPayouts(totalPlayers, payoutPercentage, payoutStructure, icmPrizePool, entryPrice);
      } else {
        // For Mystery KO and other types: winner takes all (prize pool minus bounties)
        const prizePoolAvailable = Math.max(0, totalPrizePool - totalBountiesPaid);
        icmPayouts = calculateICMPayouts(totalPlayers, 10, 'winner_takes_all', prizePoolAvailable, entryPrice);
      }
    }
    
    const leaderboard = [...activePlayers, ...eliminatedPlayers].map((entry, index) => {
      const position = index + 1;
      let prize = 0;
      
      // Calculate prize based on tournament status
      if (tournament.status === 'ended' && icmPayouts.length > 0) {
        // Assign prize based on position (1-based index, so position - 1 for array)
        prize = icmPayouts[position - 1] || 0;
      }
      // For active tournaments, prize is 0 (or could show estimated prizes)
      
      // Use calculated bounty from knockouts table, fallback to stored value if needed
      const calculatedBounty = bountiesByEntry[entry.id] || 0;
      const bountyCollected = calculatedBounty > 0 ? calculatedBounty : getBountyAsInteger(entry.bounty_collected);
      
      return {
        position,
        entry_id: entry.id,
        player_name: entry.player_name,
        entry_number: entry.entry_number,
        is_eliminated: entry.is_eliminated,
        eliminated_at: entry.eliminated_at,
        bounty_collected: bountyCollected,
        prize: prize
      };
    });
    
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
        timeRemaining: isBreak && breakTimeRemaining > 0 ? breakTimeRemaining : timeRemaining,
        levelTimeRemaining: timeRemaining,
        breakTimeRemaining: breakTimeRemaining,
        levelMinutes: structure.levelMinutes,
        isBreak,
        breakMinutes: structure.breakMinutes
      },
      leaderboard: {
        rankings: leaderboard,
        totalBountiesPaid,
        prizePool: totalPrizePool
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
    const { name, speed, max_players, max_reentries, type, entry_price, starting_blind_depth, blind_increase_rate, bba_start_level, icm_payout_percentage, icm_payout_structure } = req.body;
    
    const startingStack = calculateStartingStack(max_players, max_reentries || 0);
    const blindDepth = starting_blind_depth || 50; // Default to 50BB if not provided
    const increaseRate = blind_increase_rate || 1.25; // Default to 1.25x if not provided
    const bbaStart = bba_start_level || 6; // Default to level 6 if not provided
    const payoutPercentage = icm_payout_percentage || 20; // Default to top 20%
    const payoutStructure = icm_payout_structure || 'standard'; // Default to standard structure
    
    const result = await pool.query(
      `INSERT INTO tournaments (name, speed, max_players, max_reentries, type, entry_price, starting_stack, starting_blind_depth, blind_increase_rate, bba_start_level, icm_payout_percentage, icm_payout_structure)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [name, speed, max_players, max_reentries, type, entry_price, startingStack, blindDepth, increaseRate, bbaStart, payoutPercentage, payoutStructure]
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
        // Check if we're resuming during a break or regular level
        const speedConfig = SPEED_CONFIG[current.speed] || SPEED_CONFIG.normal;
        const isBreak = current.current_level > 0 && 
                        current.current_level % speedConfig.breakFrequency === 0;
        
        if (isBreak && current.break_start_time) {
          // Resuming during a break - restore break timer
          const breakElapsedSeconds = current.elapsed_before_pause || 0;
          updateQuery = `
            UPDATE tournaments 
            SET status = $1, 
                break_start_time = NOW() - ($3 || ' seconds')::INTERVAL,
                elapsed_before_pause = 0
            WHERE id = $2
            RETURNING *
          `;
          params = [status, id, breakElapsedSeconds];
        } else {
          // Resuming during a regular level - restore level timer
          const elapsedSeconds = current.elapsed_before_pause || 0;
          updateQuery = `
            UPDATE tournaments 
            SET status = $1, 
                level_start_time = NOW() - ($3 || ' seconds')::INTERVAL,
                elapsed_before_pause = 0
            WHERE id = $2
            RETURNING *
          `;
          params = [status, id, elapsedSeconds];
        }
      } else {
        // Fresh start
        updateQuery = `
          UPDATE tournaments 
          SET status = $1, 
              level_start_time = NOW(), 
              elapsed_before_pause = 0,
              break_start_time = NULL,
              level_elapsed_before_break = 0,
              break_completed_level = NULL
          WHERE id = $2
          RETURNING *
        `;
        params = [status, id];
      }
    } else if (status === 'paused') {
      // Calculate elapsed time before pause (in seconds)
      // Handle breaks separately from regular levels
      const speedConfig = SPEED_CONFIG[current.speed] || SPEED_CONFIG.normal;
      const isBreak = current.current_level > 0 && 
                      current.current_level % speedConfig.breakFrequency === 0;
      
      if (isBreak && current.break_start_time && current.status === 'running') {
        // Pausing during a break - save break elapsed time
        updateQuery = `
          UPDATE tournaments 
          SET status = $1, 
              elapsed_before_pause = EXTRACT(EPOCH FROM (NOW() - break_start_time))::INTEGER,
              pause_time = NOW()
          WHERE id = $2
          RETURNING *
        `;
      } else if (current.level_start_time && current.status === 'running') {
        // Pausing during a regular level
        updateQuery = `
          UPDATE tournaments 
          SET status = $1, 
              elapsed_before_pause = EXTRACT(EPOCH FROM (NOW() - level_start_time))::INTEGER,
              pause_time = NOW()
          WHERE id = $2
          RETURNING *
        `;
      } else {
        // If no start time, keep existing elapsed_before_pause
        updateQuery = `
          UPDATE tournaments 
          SET status = $1, 
              pause_time = NOW()
          WHERE id = $2
          RETURNING *
        `;
      }
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

// Skip break (end break and resume level timer)
app.patch('/api/tournaments/:id/skip-break', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get tournament to check if in break and get elapsed time
    const tournamentResult = await pool.query(
      'SELECT * FROM tournaments WHERE id = $1',
      [id]
    );
    
    if (tournamentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Tournament not found' });
    }
    
    const tournament = tournamentResult.rows[0];
    
    // Check if actually in a break
    if (!tournament.break_start_time) {
      return res.status(400).json({ error: 'Not currently in a break' });
    }
    
    const levelElapsedBeforeBreak = tournament.level_elapsed_before_break || 0;
    
    // End break and resume level timer from where it was paused
    // Mark break as completed for this level so it doesn't restart
    await pool.query(
      `UPDATE tournaments 
       SET break_start_time = NULL,
           level_start_time = NOW() - ($2 || ' seconds')::INTERVAL,
           level_elapsed_before_break = 0,
           break_completed_level = $3
       WHERE id = $1`,
      [id, levelElapsedBeforeBreak, tournament.current_level]
    );
    
    // Return success - client will refresh to get updated tournament data
    res.json({ success: true });
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
           elapsed_before_pause = 0,
           break_start_time = NULL,
           level_elapsed_before_break = 0
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
    
    // Calculate bounty using utility function
    const entryPrice = parseFloat(tournament.entry_price);
    const bountyAmount = calculateBountyAmount(entryPrice, tournament.type);
    
    // Mark entry as eliminated
    await pool.query(
      'UPDATE entries SET is_eliminated = TRUE, eliminated_at = NOW() WHERE id = $1',
      [eliminated_entry_id]
    );
    
    // Update bounty collected for eliminator
    // Bounty is already an integer from calculateBountyAmount
    if (bountyAmount > 0) {
      await pool.query(
        'UPDATE entries SET bounty_collected = bounty_collected + $1 WHERE id = $2',
        [bountyAmount, eliminator_entry_id]
      );
    }
    
    // Record knockout
    // Bounty is already an integer from calculateBountyAmount
    const result = await pool.query(
      `INSERT INTO knockouts (tournament_id, eliminator_entry_id, eliminated_entry_id, bounty_amount)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [id, eliminator_entry_id, eliminated_entry_id, bountyAmount]
    );
    
    res.json({ ...result.rows[0], bountyAmount: bountyAmount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get tournament summary (text export)
app.get('/api/tournaments/:id/summary', async (req, res) => {
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
    
    // Get knockouts with player names
    const knockoutsResult = await pool.query(`
      SELECT k.*, 
             e1.player_name as eliminator_name,
             e2.player_name as eliminated_name
      FROM knockouts k
      LEFT JOIN entries e1 ON k.eliminator_entry_id = e1.id
      LEFT JOIN entries e2 ON k.eliminated_entry_id = e2.id
      WHERE k.tournament_id = $1
      ORDER BY k.created_at ASC
    `, [id]);
    
    const entries = entriesResult.rows;
    const knockouts = knockoutsResult.rows;
    const totalEntries = entries.length;
    const totalPrizePool = totalEntries * parseFloat(tournament.entry_price);
    
    // Calculate bounties by entry using utility function
    const bountiesByEntry = {};
    knockouts.forEach(ko => {
      const eliminatorId = ko.eliminator_entry_id;
      if (eliminatorId) {
        const bounty = getBountyAsInteger(ko.bounty_amount);
        bountiesByEntry[eliminatorId] = (bountiesByEntry[eliminatorId] || 0) + bounty;
      }
    });
    
    const totalBountiesPaid = knockouts.reduce((sum, ko) => {
      return sum + getBountyAsInteger(ko.bounty_amount);
    }, 0);
    
    // Calculate leaderboard
    const activePlayers = entries.filter(e => !e.is_eliminated)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const eliminatedPlayers = entries.filter(e => e.is_eliminated)
      .sort((a, b) => new Date(b.eliminated_at || 0) - new Date(a.eliminated_at || 0));
    
    // Calculate ICM payouts if tournament is ended
    let icmPayouts = [];
    if (tournament.status === 'ended') {
      const payoutPercentage = tournament.icm_payout_percentage || 20;
      const payoutStructure = tournament.icm_payout_structure || 'standard';
      const entryPrice = parseFloat(tournament.entry_price || 0);
      
      if (tournament.type === 'icm') {
        const prizePoolAvailable = Math.max(0, totalPrizePool - totalBountiesPaid);
        icmPayouts = calculateICMPayouts(totalEntries, payoutPercentage, payoutStructure, prizePoolAvailable, entryPrice);
      } else if (tournament.type === 'ko') {
        const icmPrizePool = Math.max(0, totalPrizePool - totalBountiesPaid);
        icmPayouts = calculateICMPayouts(totalEntries, payoutPercentage, payoutStructure, icmPrizePool, entryPrice);
      } else {
        const prizePoolAvailable = Math.max(0, totalPrizePool - totalBountiesPaid);
        icmPayouts = calculateICMPayouts(totalEntries, 10, 'winner_takes_all', prizePoolAvailable, entryPrice);
      }
    }
    
    const leaderboard = [...activePlayers, ...eliminatedPlayers].map((entry, index) => {
      const position = index + 1;
      const prize = tournament.status === 'ended' && icmPayouts.length > 0 ? (icmPayouts[position - 1] || 0) : 0;
      const bountyCollected = bountiesByEntry[entry.id] || 0;
      
      return {
        position,
        player_name: entry.player_name,
        entry_number: entry.entry_number,
        is_eliminated: entry.is_eliminated,
        eliminated_at: entry.eliminated_at,
        bounty_collected: bountyCollected,
        prize: prize
      };
    });
    
    // Format dates
    const formatDate = (date) => {
      if (!date) return 'N/A';
      return new Date(date).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    };
    
    // Build summary text
    let summary = '';
    summary += '='.repeat(60) + '\n';
    summary += `TOURNAMENT SUMMARY\n`;
    summary += '='.repeat(60) + '\n\n';
    
    // Tournament Info
    summary += `Tournament: ${tournament.name}\n`;
    summary += `Type: ${tournament.type.toUpperCase()}\n`;
    summary += `Speed: ${tournament.speed.charAt(0).toUpperCase() + tournament.speed.slice(1)}\n`;
    summary += `Buy-in: $${parseFloat(tournament.entry_price)}\n`;
    summary += `Starting Stack: ${tournament.starting_stack.toLocaleString()}\n`;
    summary += `Max Players: ${tournament.max_players}\n`;
    summary += `Status: ${tournament.status.toUpperCase()}\n\n`;
    
    // Timeline
    summary += '-'.repeat(60) + '\n';
    summary += 'TIMELINE\n';
    summary += '-'.repeat(60) + '\n';
    summary += `Created: ${formatDate(tournament.created_at)}\n`;
    if (tournament.status === 'ended') {
      // Find when tournament ended (last elimination time or current time)
      const lastElimination = eliminatedPlayers.length > 0 
        ? eliminatedPlayers[0].eliminated_at 
        : null;
      summary += `Ended: ${formatDate(lastElimination || tournament.updated_at)}\n`;
    }
    summary += `Total Entries: ${totalEntries}\n`;
    summary += `Prize Pool: $${totalPrizePool.toLocaleString()}\n`;
    if (totalBountiesPaid > 0) {
      summary += `Total Bounties Paid: $${totalBountiesPaid.toLocaleString()}\n`;
    }
    summary += '\n';
    
    // Knockout History
    if (knockouts.length > 0) {
      summary += '-'.repeat(60) + '\n';
      summary += 'KNOCKOUT HISTORY\n';
      summary += '-'.repeat(60) + '\n';
      knockouts.forEach((ko, index) => {
        const time = formatDate(ko.created_at);
        const bounty = getBountyAsInteger(ko.bounty_amount);
        summary += `${index + 1}. ${time} - ${ko.eliminator_name} eliminated ${ko.eliminated_name}`;
        if (bounty > 0) {
          summary += ` (+$${bounty.toLocaleString()} bounty)`;
        }
        summary += '\n';
      });
      summary += '\n';
    }
    
    // Leaderboard
    summary += '-'.repeat(60) + '\n';
    summary += 'FINAL LEADERBOARD\n';
    summary += '-'.repeat(60) + '\n';
    summary += 'Pos | Player Name';
    if (tournament.type === 'ko' || tournament.type === 'mystery_ko') {
      summary += ' | Bounties';
    }
    if (tournament.status === 'ended') {
      summary += ' | Prize';
    }
    summary += '\n';
    summary += '-'.repeat(60) + '\n';
    
    leaderboard.forEach(player => {
      const pos = player.position.toString().padStart(3);
      const name = player.player_name.padEnd(20);
      let line = `${pos} | ${name}`;
      
      if (tournament.type === 'ko' || tournament.type === 'mystery_ko') {
        const bounties = player.bounty_collected > 0 ? `$${player.bounty_collected.toLocaleString()}` : '$0';
        line += ` | ${bounties.padEnd(10)}`;
      }
      
      if (tournament.status === 'ended') {
        const prize = player.prize > 0 ? `$${player.prize.toLocaleString()}` : '$0';
        line += ` | ${prize}`;
      }
      
      summary += line + '\n';
    });
    summary += '\n';
    
    // Payout Summary
    if (tournament.status === 'ended') {
      const winners = leaderboard.filter(p => p.prize > 0);
      if (winners.length > 0) {
        summary += '-'.repeat(60) + '\n';
        summary += 'PAYOUT SUMMARY\n';
        summary += '-'.repeat(60) + '\n';
        winners.forEach(player => {
          const icon = player.position === 1 ? '🥇' : player.position === 2 ? '🥈' : player.position === 3 ? '🥉' : `${player.position}.`;
          summary += `${icon} ${player.player_name}: $${player.prize.toLocaleString()}\n`;
        });
        summary += '\n';
      }
    }
    
    // Bounty Summary (for KO tournaments)
    if ((tournament.type === 'ko' || tournament.type === 'mystery_ko') && Object.keys(bountiesByEntry).length > 0) {
      summary += '-'.repeat(60) + '\n';
      summary += 'BOUNTY SUMMARY\n';
      summary += '-'.repeat(60) + '\n';
      const bountyLeaders = leaderboard
        .filter(p => p.bounty_collected > 0)
        .sort((a, b) => b.bounty_collected - a.bounty_collected);
      
      bountyLeaders.forEach(player => {
        summary += `${player.player_name}: $${player.bounty_collected.toLocaleString()}\n`;
      });
      summary += '\n';
    }
    
    summary += '='.repeat(60) + '\n';
    summary += `Generated: ${formatDate(new Date())}\n`;
    summary += '='.repeat(60) + '\n';
    
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="tournament-${tournament.name.replace(/[^a-z0-9]/gi, '_')}-summary.txt"`);
    res.send(summary);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate summary' });
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

