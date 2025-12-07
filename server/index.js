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

// Calculate GCD of denominations to find the smallest makeable unit
function calculateGCD(a, b) {
  return b === 0 ? a : calculateGCD(b, a % b);
}

// Get the smallest makeable unit (GCD of all denominations)
function getSmallestMakeableUnit(denominations) {
  if (denominations.length === 0) return 1;
  if (denominations.length === 1) return denominations[0];
  
  let gcd = denominations[0];
  for (let i = 1; i < denominations.length; i++) {
    gcd = calculateGCD(gcd, denominations[i]);
  }
  return gcd;
}

// Check if a value can be made with available chip denominations
function canMakeValue(value, denominations) {
  if (value === 0) return true;
  if (value < 0) return false;
  
  const smallestUnit = getSmallestMakeableUnit(denominations);
  // If value is not a multiple of the smallest unit, it can't be made
  if (value % smallestUnit !== 0) return false;
  
  // Try to make the value using available denominations (greedy algorithm)
  let remaining = value;
  const sortedDenoms = [...denominations].sort((a, b) => b - a);
  
  for (const denom of sortedDenoms) {
    const count = Math.floor(remaining / denom);
    remaining -= count * denom;
    if (remaining === 0) return true;
  }
  
  return false;
}

// Round a value to the nearest makeable value with available chips
function roundToMakeableValue(value, denominations) {
  if (canMakeValue(value, denominations)) {
    return value;
  }
  
  const smallestUnit = getSmallestMakeableUnit(denominations);
  
  // Round to nearest multiple of smallest unit
  const roundedDown = Math.floor(value / smallestUnit) * smallestUnit;
  const roundedUp = Math.ceil(value / smallestUnit) * smallestUnit;
  
  // Verify both can actually be made (in case greedy algorithm fails)
  const canMakeDown = canMakeValue(roundedDown, denominations);
  const canMakeUp = canMakeValue(roundedUp, denominations);
  
  if (!canMakeDown && !canMakeUp) {
    // If neither works, try further away
    let testValue = roundedUp;
    while (!canMakeValue(testValue, denominations) && testValue < value * 2) {
      testValue += smallestUnit;
    }
    return testValue;
  }
  
  if (!canMakeDown) return roundedUp;
  if (!canMakeUp) return roundedDown;
  
  // Choose the closer one, or round up if equidistant (better for poker blinds)
  return (roundedUp - value) <= (value - roundedDown) ? roundedUp : roundedDown;
}

// Round to "nice" poker blind values for better playability
// Nice values: 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, etc.
function roundToNiceBlind(value) {
  if (value <= 0) return 10;
  
  // For very small values, round to nearest 10
  if (value < 25) {
    return Math.round(value / 10) * 10;
  }
  
  // Determine the order of magnitude
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const normalized = value / magnitude;
  
  // Round to nice numbers: 1, 2, 5, 10 (always round up for poker)
  let niceNormalized;
  if (normalized <= 1.5) {
    niceNormalized = 1;
  } else if (normalized <= 2.5) {
    niceNormalized = 2;
  } else if (normalized <= 5) {
    niceNormalized = 5;
  } else {
    niceNormalized = 10;
  }
  
  // If the rounded value is less than the original, go to next nice number
  const rounded = niceNormalized * magnitude;
  if (rounded < value) {
    // Find next nice number
    if (niceNormalized === 1) {
      niceNormalized = 2;
    } else if (niceNormalized === 2) {
      niceNormalized = 5;
    } else if (niceNormalized === 5) {
      niceNormalized = 10;
    } else {
      niceNormalized = 10;
      magnitude *= 10;
    }
  }
  
  return niceNormalized * magnitude;
}

// Generate blind structure dynamically based on starting stack, speed, starting blind depth, blind increase rate, and BBA start level
function generateBlindStructure(startingStack, speed, startingBlindDepth = 50, blindIncreaseRate = 1.25, bbaStartLevel = 6) {
  const denominations = getAvailableDenominations();
  const smallestDenom = Math.min(...denominations);
  const config = SPEED_CONFIG[speed] || SPEED_CONFIG.normal;
  
  const levels = [];
  
  // Calculate initial big blind based on starting blind depth (e.g., 100BB means BB = startingStack / 100)
  // startingBlindDepth is the number of big blinds in the starting stack
  const initialBB = Math.floor(startingStack / startingBlindDepth);
  let currentSB = Math.floor(initialBB / 2);
  
  // Ensure we don't go below smallest denomination
  currentSB = Math.max(smallestDenom, currentSB);
  currentSB = roundToNiceBlind(currentSB);
  currentSB = roundToMakeableValue(currentSB, denominations);
  
  // Use provided blind increase rate, or fall back to speed-based defaults if not provided
  let progression = parseFloat(blindIncreaseRate);
  if (isNaN(progression) || progression <= 1) {
    // Fallback to speed-based progression if invalid
    const progressionFactors = {
      turbo: 1.4,
      normal: 1.25,
      slow: 1.2
    };
    progression = progressionFactors[speed] || progressionFactors.normal;
  }
  
  // Generate levels until we reach very high blinds (about 50% of starting stack)
  const maxBlind = Math.floor(startingStack * 0.5);
  let level = 0;
  let previousSB = 0;
  
  while (currentSB < maxBlind && level < 50) {
    // Round to nice blind value first
    let niceSB = roundToNiceBlind(currentSB);
    niceSB = roundToMakeableValue(niceSB, denominations);
    
    // Ensure blind always increases
    if (level > 0 && niceSB <= previousSB) {
      niceSB = previousSB + smallestDenom;
      niceSB = roundToNiceBlind(niceSB);
      niceSB = roundToMakeableValue(niceSB, denominations);
      // If still not increased, force it
      if (niceSB <= previousSB) {
        niceSB = previousSB + smallestDenom;
        niceSB = roundToNiceBlind(niceSB);
        niceSB = roundToMakeableValue(niceSB, denominations);
      }
    }
    
    // Big blind is always exactly 2x small blind (no rounding needed)
    const niceBB = niceSB * 2;
    
    // Add BBA (Big Blind Ante) starting from specified level
    // Ante is always 1BB (big blind), and the big blind player also pays the ante
    let roundedAnte = 0;
    const levelNumber = level + 1; // Level numbers are 1-indexed
    if (levelNumber >= bbaStartLevel) {
      // Ante equals the big blind
      roundedAnte = niceBB;
    }
    
    levels.push({
      sb: niceSB,
      bb: niceBB,
      ante: roundedAnte
    });
    
    // Progress to next level
    let nextSB = Math.floor(niceSB * progression);
    nextSB = roundToNiceBlind(nextSB);
    nextSB = roundToMakeableValue(nextSB, denominations);
    
    // Ensure progression actually increases
    if (nextSB <= niceSB) {
      nextSB = niceSB + smallestDenom;
      nextSB = roundToNiceBlind(nextSB);
      nextSB = roundToMakeableValue(nextSB, denominations);
    }
    
    previousSB = niceSB;
    currentSB = nextSB;
    
    level++;
  }
  
  return {
    ...config,
    levels
  };
}

// Calculate starting stack based on players and reentries
function calculateStartingStack(maxPlayers, maxReentries = 0) {
  // Total chip value available
  const totalChipValue = Object.entries(CHIP_SET).reduce((sum, [value, count]) => {
    return sum + (parseInt(value) * count);
  }, 0);
  
  // Calculate maximum possible entries (initial entry + reentries)
  const maxPossibleEntries = maxPlayers * (maxReentries + 1);
  
  // Divide total chips by max possible entries
  const perEntry = Math.floor(totalChipValue / maxPossibleEntries);
  
  // Round down to nearest 100 for cleaner numbers
  const roundedStack = Math.floor(perEntry / 100) * 100;
  
  // Ensure minimum of smallest chip denomination
  const smallestDenom = Math.min(...Object.keys(CHIP_SET).map(Number));
  return Math.max(smallestDenom, roundedStack);
}

// Calculate chip distribution for starting stack, accounting for blind levels
function calculateChipDistribution(startingStack, numPlayers, blindStructure = null) {
  const distribution = {};
  const denominations = getAvailableDenominations().sort((a, b) => b - a);
  const smallestDenom = Math.min(...denominations);
  
  // Calculate minimum chips needed for early blinds (first 5-10 levels)
  let minChipsForBlinds = {};
  if (blindStructure && blindStructure.levels && blindStructure.levels.length > 0) {
    // Look at first few levels to determine minimum chip requirements
    const earlyLevels = blindStructure.levels.slice(0, Math.min(8, blindStructure.levels.length));
    
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
  }
  
  // Distribute starting stack from highest to lowest denomination
  let remaining = startingStack;
  
  for (const denom of denominations) {
    if (denom > startingStack) continue;
    
    const maxChipsAvailable = Math.floor(CHIP_SET[denom] / numPlayers);
    const neededForStack = Math.floor(remaining / denom);
    
    // Use the maximum of: needed for stack, minimum for blinds
    const minNeededForBlinds = minChipsForBlinds[denom] || 0;
    const chips = Math.min(maxChipsAvailable, Math.max(neededForStack, minNeededForBlinds));
    
    if (chips > 0) {
      distribution[denom] = chips;
      remaining -= chips * denom;
    }
  }
  
  // Add remaining with smallest denomination
  if (remaining > 0) {
    distribution[smallestDenom] = (distribution[smallestDenom] || 0) + Math.ceil(remaining / smallestDenom);
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
      structure
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
  const chipDistribution = calculateChipDistribution(startingStack, max_players, structure);
  
  // Calculate max possible entries for prize pool
  const maxPossibleEntries = max_players * ((max_reentries || 0) + 1);
  
  res.json({
    startingStack,
    levelMinutes: structure.levelMinutes,
    breakFrequency: structure.breakFrequency,
    breakMinutes: structure.breakMinutes,
    blindLevels: structure.levels.slice(0, 15),
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
