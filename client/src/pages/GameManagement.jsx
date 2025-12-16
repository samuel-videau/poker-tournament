import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTournament } from '../hooks/useTournament';
import { 
  updateTournamentStatus, 
  advanceLevel,
  skipBreak, 
  addEntry, 
  recordKnockout,
  formatCurrency, 
  formatNumber, 
  formatTime,
  exportTournamentSummary
} from '../utils/api';
import { trackTournamentStarted, trackTournamentEnded, trackPlayerEntryAdded, trackKnockoutRecorded } from '../utils/analytics';
import BlindLevel from '../components/BlindLevel';
import ChipStack from '../components/ChipStack';
import Leaderboard from '../components/Leaderboard';

const STATUS_COLORS = {
  pending: 'badge-pending',
  running: 'badge-running',
  paused: 'badge-paused',
  ended: 'badge-ended'
};

export default function GameManagement() {
  const { id } = useParams();
  const { user, token, signOut } = useAuth();
  const { tournament, loading, error, refresh } = useTournament(id, 1000, token);
  
  const [newPlayerName, setNewPlayerName] = useState('');
  const [showKOModal, setShowKOModal] = useState(false);
  const [koEliminator, setKoEliminator] = useState('');
  const [koEliminated, setKoEliminated] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState(null);
  
  // Local timer state for smooth countdown
  const [localTimeRemaining, setLocalTimeRemaining] = useState(0);

  // Clear action error after 5 seconds
  useEffect(() => {
    if (actionError) {
      const timer = setTimeout(() => setActionError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [actionError]);

  const countdownIntervalRef = useRef(null);
  const syncIntervalRef = useRef(null);
  
  // Define handleNextLevel for manual advancement
  const handleNextLevel = useCallback(async () => {
    setActionLoading(true);
    try {
      await advanceLevel(id, token);
      refresh();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setActionLoading(false);
    }
  }, [id, token, refresh]);

  // Define handleSkipBreak for skipping breaks
  const handleSkipBreak = useCallback(async () => {
    setActionLoading(true);
    try {
      await skipBreak(id, token);
      refresh();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setActionLoading(false);
    }
  }, [id, token, refresh]);
  
  // Initialize timer when level changes, status changes, or break state changes
  useEffect(() => {
    if (!tournament?.stats) return;
    // Reset timer when level changes, status changes, or break state changes
    setLocalTimeRemaining(tournament.stats.timeRemaining);
  }, [tournament?.current_level, tournament?.status, tournament?.stats?.isBreak]);

  // Local countdown for smooth display - only when running
  useEffect(() => {
    // Clear any existing interval
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    
    if (tournament?.status !== 'running' || !tournament?.stats) {
      return;
    }
    
    // Start countdown
    countdownIntervalRef.current = setInterval(() => {
      setLocalTimeRemaining(prev => {
        const newTime = prev > 0 ? prev - 1 : 0;
        // Server will automatically advance level when timer expires
        // No need to call handleNextLevel here
        return newTime;
      });
    }, 1000);

    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
    };
  }, [tournament?.status, tournament?.current_level, tournament?.stats?.isBreak]);

  // Periodic sync with server to prevent drift (every 10 seconds)
  useEffect(() => {
    // Clear any existing sync interval
    if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current);
      syncIntervalRef.current = null;
    }
    
    if (tournament?.status !== 'running' || !tournament?.stats) {
      return;
    }
    
    // Sync every 10 seconds to prevent drift
    syncIntervalRef.current = setInterval(() => {
      if (tournament?.stats?.timeRemaining !== undefined) {
        setLocalTimeRemaining(prev => {
          const diff = Math.abs(prev - tournament.stats.timeRemaining);
          // Only sync if difference is more than 3 seconds to avoid interfering with countdown
          if (diff > 3) {
            return tournament.stats.timeRemaining;
          }
          return prev;
        });
      }
    }, 10000); // Sync every 10 seconds

    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
        syncIntervalRef.current = null;
      }
    };
  }, [tournament?.status, tournament?.stats?.timeRemaining]);

  const handleStatusChange = async (status) => {
    setActionLoading(true);
    try {
      await updateTournamentStatus(id, status, token);
      if (status === 'running') {
        trackTournamentStarted(id);
      } else if (status === 'ended') {
        trackTournamentEnded(id);
      }
      refresh();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddEntry = async (e) => {
    e.preventDefault();
    if (!newPlayerName.trim()) return;
    
    setActionLoading(true);
    try {
      await addEntry(id, newPlayerName.trim(), token);
      setNewPlayerName('');
      trackPlayerEntryAdded(id);
      refresh();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRecordKO = async () => {
    if (!koEliminator || !koEliminated) return;
    
    setActionLoading(true);
    try {
      const result = await recordKnockout(id, koEliminator, koEliminated, token);
      setShowKOModal(false);
      setKoEliminator('');
      setKoEliminated('');
      trackKnockoutRecorded(id);
      refresh();
      
      if (result.bountyAmount > 0) {
        if (tournament.type === 'pko' && result.immediateReward !== undefined) {
          alert(`Bounty collected: ${formatCurrency(result.immediateReward)}\nBounty increased by: ${formatCurrency(result.bountyIncrease || 0)}`);
        } else {
          alert(`Bounty collected: ${formatCurrency(result.bountyAmount)}`);
        }
      }
    } catch (err) {
      setActionError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-casino-dark to-casino-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-gold-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !tournament) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-casino-dark to-casino-black flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">❌</div>
          <h2 className="text-2xl text-red-400">{error || 'Tournament not found'}</h2>
          <Link to="/host" className="btn btn-outline mt-4">Back to Dashboard</Link>
        </div>
      </div>
    );
  }

  const { stats, entries = [], knockouts = [] } = tournament;
  const activeEntries = entries.filter(e => !e.is_eliminated);
  const isKO = tournament.type === 'ko' || tournament.type === 'mystery_ko' || tournament.type === 'pko';

  return (
    <div className="min-h-screen bg-gradient-to-b from-casino-dark to-casino-black">
      {/* Header */}
      <header className="border-b border-white/5 bg-casino-black/50 sticky top-0 z-40 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to="/host" className="text-gray-500 hover:text-gold-400 transition-colors">
                ← Back
              </Link>
              <div>
                <h1 className="font-display text-2xl font-bold text-white">
                  {tournament.name}
                </h1>
                <div className="flex items-center gap-3 mt-1">
                  <span className={`badge ${STATUS_COLORS[tournament.status]}`}>
                    {tournament.status}
                  </span>
                  <span className="text-gray-500 text-sm">Level {tournament.current_level}</span>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              {user && (
                <div className="flex items-center gap-2">
                  {user.photoURL && (
                    <img 
                      src={user.photoURL} 
                      alt={user.displayName || 'User'} 
                      className="w-6 h-6 rounded-full"
                    />
                  )}
                  <span className="text-gray-400 text-sm">{user.displayName || user.email}</span>
                </div>
              )}
              <Link
                to={`/display/${id}`}
                target="_blank"
                className="btn btn-outline"
              >
                Open Public Display ↗
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">
        {/* Error Alert */}
        {actionError && (
          <div className="mb-6 p-4 bg-red-900/50 border border-red-500/50 rounded-lg text-red-200">
            {actionError}
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Main Controls Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Tournament Status Card */}
            <div className="card p-6">
              <div className="grid md:grid-cols-2 gap-6">
                {/* Current Blinds */}
                <div>
                  <h3 className="text-sm uppercase tracking-wider text-gray-500 mb-3">Current Blinds</h3>
                  <div className="text-xs uppercase tracking-wider text-gray-600 mb-2">
                    Level {tournament.current_level}
                  </div>
                  <BlindLevel level={stats?.currentBlind} size="large" />
                  
                  {stats?.nextBlind && (
                    <div className="mt-4 pt-4 border-t border-white/5">
                      <div className="text-xs uppercase tracking-wider text-gray-600 mb-1">Next Level</div>
                      <BlindLevel level={stats.nextBlind} size="normal" />
                    </div>
                  )}
                </div>

                {/* Timer & Stats */}
                <div>
                  <h3 className="text-sm uppercase tracking-wider text-gray-500 mb-3">Level Timer</h3>
                  <div className="timer-display text-5xl font-bold text-gold-400">
                    {formatTime(tournament?.status === 'running' ? localTimeRemaining : (stats?.timeRemaining || 0))}
                  </div>
                  <div className="text-gray-500 text-sm mt-1">
                    {stats?.isBreak 
                      ? `${stats?.breakMinutes} min break` 
                      : `${stats?.levelMinutes} min levels`}
                  </div>
                  
                  {stats?.isBreak && (
                    <div className="mt-4 p-3 bg-amber-900/30 border border-amber-500/30 rounded-lg text-amber-300">
                      ⏸ Break Time - Level timer paused
                    </div>
                  )}
                </div>
              </div>

              {/* Control Buttons */}
              <div className="flex flex-wrap gap-3 mt-6 pt-6 border-t border-white/5">
                {tournament.status === 'pending' && (
                  <button
                    onClick={() => handleStatusChange('running')}
                    disabled={actionLoading || entries.length < 2}
                    className="btn btn-success"
                  >
                    ▶ Start Tournament
                  </button>
                )}
                
                {tournament.status === 'running' && (
                  <>
                    <button
                      onClick={() => handleStatusChange('paused')}
                      disabled={actionLoading}
                      className="btn btn-outline"
                    >
                      ⏸ Pause
                    </button>
                    {stats?.isBreak ? (
                      <button
                        onClick={handleSkipBreak}
                        disabled={actionLoading}
                        className="btn btn-gold"
                      >
                        ⏭ Skip Break
                      </button>
                    ) : (
                      <button
                        onClick={handleNextLevel}
                        disabled={actionLoading}
                        className="btn btn-gold"
                      >
                        ⏭ Next Level
                      </button>
                    )}
                  </>
                )}
                
                {tournament.status === 'paused' && (
                  <button
                    onClick={() => handleStatusChange('running')}
                    disabled={actionLoading}
                    className="btn btn-success"
                  >
                    ▶ Resume
                  </button>
                )}
                
                {(tournament.status === 'running' || tournament.status === 'paused') && (
                  <button
                    onClick={() => handleStatusChange('ended')}
                    disabled={actionLoading}
                    className="btn btn-danger ml-auto"
                  >
                    ⏹ End Tournament
                  </button>
                )}
                
                {tournament.status === 'ended' && (
                  <button
                    onClick={async () => {
                      try {
                        await exportTournamentSummary(id, token);
                      } catch (err) {
                        alert('Failed to export summary: ' + err.message);
                      }
                    }}
                    className="btn btn-outline ml-auto"
                  >
                    📄 Export Summary
                  </button>
                )}
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="card p-4 text-center">
                <div className="text-xs uppercase tracking-wider text-gray-500">Active / Total</div>
                <div className="text-2xl font-mono mt-1">
                  <span className="text-emerald-400">{stats?.activeEntries || 0}</span>
                  <span className="text-gray-600"> / </span>
                  <span className="text-white">{stats?.totalEntries || 0}</span>
                </div>
              </div>
              <div className="card p-4 text-center">
                <div className="text-xs uppercase tracking-wider text-gray-500">Prize Pool</div>
                <div className="text-2xl font-mono text-gold-400 mt-1">
                  {formatCurrency(stats?.totalPrizePool || 0)}
                </div>
              </div>
              <div className="card p-4 text-center">
                <div className="text-xs uppercase tracking-wider text-gray-500">Avg Stack</div>
                <div className="text-2xl font-mono text-white mt-1">
                  {formatNumber(stats?.averageStack || tournament.starting_stack)}
                </div>
              </div>
              <div className="card p-4 text-center">
                <div className="text-xs uppercase tracking-wider text-gray-500">Starting Stack</div>
                <div className="text-2xl font-mono text-gray-400 mt-1">
                  {formatNumber(tournament.starting_stack)}
                </div>
              </div>
            </div>

            {/* Players Table */}
            <div className="card overflow-hidden">
              <div className="p-4 border-b border-white/5 flex items-center justify-between">
                <h3 className="font-display text-lg text-white">Players ({entries.length})</h3>
                
                {/* Add Entry Form */}
                {tournament.status !== 'ended' && (
                  <form onSubmit={handleAddEntry} className="flex gap-2">
                    <input
                      type="text"
                      value={newPlayerName}
                      onChange={(e) => setNewPlayerName(e.target.value)}
                      placeholder="Player name"
                      className="input py-2 px-3 w-40"
                    />
                    <button 
                      type="submit" 
                      disabled={actionLoading || !newPlayerName.trim()}
                      className="btn btn-gold py-2"
                    >
                      + Add Entry
                    </button>
                  </form>
                )}
              </div>
              
              <div className="divide-y divide-white/5 max-h-80 overflow-y-auto">
                {entries.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">
                    No entries yet. Add players to get started.
                  </div>
                ) : (
                  entries.map((entry, idx) => (
                    <div 
                      key={entry.id} 
                      className={`p-3 flex items-center justify-between ${entry.is_eliminated ? 'opacity-50' : ''}`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-gray-600 text-sm w-6">{idx + 1}</span>
                        <span className={entry.is_eliminated ? 'line-through text-gray-500' : 'text-white'}>
                          {entry.player_name}
                        </span>
                        {entry.entry_number > 1 && (
                          <span className="text-xs px-2 py-0.5 bg-amber-600/30 text-amber-400 rounded">
                            Re-entry #{entry.entry_number}
                          </span>
                        )}
                        {entry.is_eliminated && (
                          <span className="text-xs px-2 py-0.5 bg-red-600/30 text-red-400 rounded">
                            Eliminated
                          </span>
                        )}
                      </div>
                      {isKO && entry.bounty_collected > 0 && (
                        <span className="text-emerald-400 text-sm">
                          +{formatCurrency(parseFloat(entry.bounty_collected))}
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Leaderboard */}
            {tournament.leaderboard && (
              <Leaderboard 
                leaderboard={tournament.leaderboard} 
                tournamentStatus={tournament.status}
                tournamentType={tournament.type}
              />
            )}
            
            {/* Actions Card */}
            {tournament.status !== 'ended' && tournament.status !== 'pending' && (
              <div className="card p-4">
                <h3 className="font-display text-lg text-white mb-4">Quick Actions</h3>
                <div className="space-y-3">
                  <button
                    onClick={() => setShowKOModal(true)}
                    disabled={activeEntries.length < 2}
                    className="btn btn-outline w-full"
                  >
                    💀 Record Knockout
                  </button>
                </div>
              </div>
            )}

            {/* Recent KOs */}
            {knockouts.length > 0 && (
              <div className="card p-4">
                <h3 className="font-display text-lg text-white mb-4">Recent Knockouts</h3>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {knockouts.slice(0, 10).map(ko => {
                    const bountyAmount = parseFloat(ko.bounty_amount) || 0;
                    const isPKO = tournament.type === 'pko';
                    const immediateReward = isPKO && bountyAmount > 0 ? Math.ceil(bountyAmount / 2) : bountyAmount;
                    const bountyIncrease = isPKO && bountyAmount > 0 ? bountyAmount - immediateReward : 0;
                    
                    return (
                      <div key={ko.id} className="p-2 bg-casino-black/50 rounded text-sm">
                        <span className="text-emerald-400">{ko.eliminator_name}</span>
                        <span className="text-gray-500"> eliminated </span>
                        <span className="text-red-400">{ko.eliminated_name}</span>
                        {bountyAmount > 0 && (
                          <div className="mt-1 flex flex-col gap-0.5">
                            {isPKO ? (
                              <>
                                <span className="text-gold-400">
                                  +{formatCurrency(immediateReward)} collected
                                </span>
                                {bountyIncrease > 0 && (
                                  <span className="text-amber-400 text-xs">
                                    Bounty +{formatCurrency(bountyIncrease)}
                                  </span>
                                )}
                              </>
                            ) : (
                              <span className="text-gold-400">
                                +{formatCurrency(bountyAmount)}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Tournament Info */}
            <div className="card p-4">
              <h3 className="font-display text-lg text-white mb-4">Tournament Info</h3>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-500">Type</dt>
                  <dd className="text-white capitalize">{tournament.type.replace('_', ' ')}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Speed</dt>
                  <dd className="text-white capitalize">{tournament.speed}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Buy-in</dt>
                  <dd className="text-gold-400">{formatCurrency(parseFloat(tournament.entry_price))}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Max Players</dt>
                  <dd className="text-white">{tournament.max_players}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Max Re-entries</dt>
                  <dd className="text-white">{tournament.max_reentries}</dd>
                </div>
              </dl>
            </div>

            {/* Chip Distribution */}
            {tournament.chipDistribution && (
              <div className="card p-4">
                <h3 className="font-display text-lg text-white mb-4">Chip Distribution</h3>
                <ChipStack distribution={tournament.chipDistribution} />
              </div>
            )}

            {/* Blind Structure */}
            {tournament.blindStructure && tournament.blindStructure.levels && (
              <div className="card p-4 overflow-hidden flex flex-col">
                <h3 className="font-display text-lg text-white mb-4 pb-3 border-b border-white/10">
                  Blind Structure
                </h3>
                <div className="flex-1 overflow-y-auto max-h-96">
                  <div className="space-y-1">
                    {tournament.blindStructure.levels.map((level, index) => {
                      const levelNum = index + 1;
                      const isCurrent = levelNum === tournament.current_level;
                      const isPast = levelNum < tournament.current_level;
                      const isNext = levelNum === tournament.current_level + 1;
                      
                      return (
                        <div
                          key={index}
                          className={`p-3 rounded-lg transition-all ${
                            isCurrent
                              ? 'bg-gold-500/20 border-2 border-gold-500/50'
                              : isPast
                              ? 'bg-casino-black/50 opacity-60'
                              : isNext
                              ? 'bg-amber-500/10 border border-amber-500/30'
                              : 'bg-casino-black/30 hover:bg-casino-black/50'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <span className={`font-mono text-sm font-bold ${
                                isCurrent ? 'text-gold-400' : isPast ? 'text-gray-500' : 'text-gray-400'
                              }`}>
                                {levelNum}
                              </span>
                              <div className="font-mono text-sm">
                                <span className={isCurrent ? 'text-gold-400 font-bold' : isPast ? 'text-gray-500' : 'text-gray-300'}>
                                  {formatNumber(level.sb)}
                                </span>
                                <span className="text-gray-600 mx-1">/</span>
                                <span className={isCurrent ? 'text-gold-300 font-bold' : isPast ? 'text-gray-500' : 'text-gray-300'}>
                                  {formatNumber(level.bb)}
                                </span>
                                {level.ante > 0 && (
                                  <>
                                    <span className="text-gray-600 mx-1">|</span>
                                    <span className={`text-xs ${
                                      isCurrent ? 'text-emerald-400' : isPast ? 'text-gray-500' : 'text-gray-400'
                                    }`}>
                                      A: {formatNumber(level.ante)}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                            {isCurrent && (
                              <span className="text-xs px-2 py-0.5 bg-gold-500/30 text-gold-300 rounded font-semibold">
                                Current
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* KO Modal */}
      {showKOModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="card max-w-md w-full p-6">
            <h2 className="font-display text-2xl gold-text mb-6">Record Knockout</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Winner (Eliminator)
                </label>
                <select
                  value={koEliminator}
                  onChange={(e) => setKoEliminator(e.target.value)}
                  className="select"
                >
                  <option value="">Select player...</option>
                  {activeEntries
                    .filter(e => e.id.toString() !== koEliminated)
                    .map(entry => (
                      <option key={entry.id} value={entry.id}>
                        {entry.player_name} {entry.entry_number > 1 ? `(#${entry.entry_number})` : ''}
                      </option>
                    ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Eliminated Player
                </label>
                <select
                  value={koEliminated}
                  onChange={(e) => setKoEliminated(e.target.value)}
                  className="select"
                >
                  <option value="">Select player...</option>
                  {activeEntries
                    .filter(e => e.id.toString() !== koEliminator)
                    .map(entry => (
                      <option key={entry.id} value={entry.id}>
                        {entry.player_name} {entry.entry_number > 1 ? `(#${entry.entry_number})` : ''}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div className="flex gap-4 mt-6">
              <button
                onClick={() => {
                  setShowKOModal(false);
                  setKoEliminator('');
                  setKoEliminated('');
                }}
                className="btn btn-outline flex-1"
              >
                Cancel
              </button>
              <button
                onClick={handleRecordKO}
                disabled={actionLoading || !koEliminator || !koEliminated}
                className="btn btn-gold flex-1"
              >
                Confirm KO
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
