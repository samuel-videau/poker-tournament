import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useTournament, useTimer } from '../hooks/useTournament';
import { formatCurrency, formatNumber, formatTime, advanceLevel } from '../utils/api';
import Leaderboard from '../components/Leaderboard';

export default function PublicDisplay() {
  const { id } = useParams();
  const { tournament, loading, error, refresh } = useTournament(id, 500); // Poll every 500ms for smoother updates
  const audioRef = useRef(null);
  const [playedLevelEnd, setPlayedLevelEnd] = useState(false);

  // Calculate local time remaining
  const [localTimeRemaining, setLocalTimeRemaining] = useState(0);
  const countdownIntervalRef = useRef(null);
  const syncIntervalRef = useRef(null);
  const playedLevelEndRef = useRef(false);
  
  // Initialize timer when level changes, status changes, or break state changes
  useEffect(() => {
    if (!tournament?.stats) return;
    // Reset timer when level changes, status changes, or break state changes
    setLocalTimeRemaining(tournament.stats.timeRemaining);
    setPlayedLevelEnd(false);
    playedLevelEndRef.current = false;
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
        
        // When timer reaches 0, play sound (only once per level)
        if (newTime === 0 && prev > 0 && !playedLevelEndRef.current) {
          audioRef.current?.play().catch(() => {});
          setPlayedLevelEnd(true);
          playedLevelEndRef.current = true;
          // The server will automatically advance the level when timer expires
        }
        
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
  }, [tournament?.status, tournament?.stats?.timeRemaining, tournament?.stats?.isBreak]);

  if (loading) {
    return (
      <div className="min-h-screen animated-bg flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-gold-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-gold-400/70 mt-4 font-display text-xl">Loading Tournament...</p>
        </div>
      </div>
    );
  }

  if (error || !tournament) {
    return (
      <div className="min-h-screen animated-bg flex items-center justify-center">
        <div className="text-center">
          <div className="text-8xl mb-4">🃏</div>
          <h2 className="text-4xl font-display text-red-400">{error || 'Tournament Not Found'}</h2>
        </div>
      </div>
    );
  }

  const { stats } = tournament;
  const isRunning = tournament.status === 'running';
  const isPaused = tournament.status === 'paused';
  const isEnded = tournament.status === 'ended';
  const isPending = tournament.status === 'pending';

  // Calculate timer color based on remaining time
  const timerColor = localTimeRemaining <= 30 
    ? 'text-red-500 animate-pulse' 
    : localTimeRemaining <= 60 
      ? 'text-amber-400' 
      : 'text-gold-400';

  const blindStructure = tournament.blindStructure?.levels || [];

  return (
    <div className="min-h-screen bg-gradient-to-b from-casino-dark to-casino-black public-display overflow-hidden">
      {/* Audio for level change */}
      <audio ref={audioRef} src="data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj2a2teleUUnVo7C3dB6STZjmt7g3Yxma3OOo6qxrJuWkH9gPDpAVnOAenpYQzQAAAAA" />
      
      {/* Header */}
      <header className="border-b border-white/5 bg-casino-black/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-[1920px] mx-auto px-8 py-4 flex items-center justify-between">
          <div>
            <h1 className="font-display text-3xl md:text-4xl font-bold gold-text">
              {tournament.name}
            </h1>
            <p className="text-gray-500 text-sm md:text-base mt-1 capitalize">
              {tournament.type.replace('_', ' ')} • {tournament.speed} Speed
            </p>
          </div>
          
          <div className="text-right">
            {isPending && (
              <div className="text-lg md:text-xl text-gray-400 font-display">
                ⏳ Waiting to Start
              </div>
            )}
            {isPaused && (
              <div className="text-xl md:text-2xl text-amber-400 font-display animate-pulse">
                ⏸ PAUSED
              </div>
            )}
            {isEnded && (
              <div className="text-xl md:text-2xl text-red-400 font-display">
                🏆 TOURNAMENT ENDED
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content - Split Layout */}
      <main className="max-w-[1920px] mx-auto px-8 py-6 h-[calc(100vh-100px)] flex gap-6">
        {/* Left Side - Main Content (2/3 width) */}
        <div className="flex-1 flex flex-col gap-6" style={{ width: '66.666%' }}>
          {/* Timer - Most Important */}
          <div className="card p-8 text-center">
            <div className="text-xs uppercase tracking-widest text-gray-500 mb-3">
              {stats?.isBreak ? 'Break Time' : `Level ${tournament.current_level}`}
            </div>
            <div className={`timer-display text-8xl md:text-9xl font-bold ${timerColor} mb-2`}>
              {formatTime(localTimeRemaining)}
            </div>
            <div className="text-gray-500 text-sm">
              {stats?.isBreak 
                ? `${stats?.breakMinutes} minute break` 
                : `${stats?.levelMinutes} minute levels`}
            </div>
          </div>

          {/* Current Blinds - High Importance */}
          <div className="card p-6">
            <div className="text-xs uppercase tracking-widest text-gray-500 mb-4">Current Blinds</div>
            <div className="flex items-baseline gap-4 justify-center">
              <span className="font-mono text-5xl md:text-6xl font-bold text-gold-400">
                {formatNumber(stats?.currentBlind?.sb || 0)}
              </span>
              <span className="text-3xl text-gray-600">/</span>
              <span className="font-mono text-5xl md:text-6xl font-bold text-gold-300">
                {formatNumber(stats?.currentBlind?.bb || 0)}
              </span>
            </div>
            {stats?.currentBlind?.ante > 0 && (
              <div className="mt-4 text-center text-xl">
                <span className="text-gray-500">Ante: </span>
                <span className="font-mono text-emerald-400 font-bold">
                  {formatNumber(stats.currentBlind.ante)}
                </span>
              </div>
            )}
            {stats?.nextBlind && (
              <div className="mt-6 pt-6 border-t border-white/5">
                <div className="text-xs uppercase tracking-widest text-gray-600 mb-2">Next Level</div>
                <div className="flex items-baseline gap-3 justify-center opacity-70">
                  <span className="font-mono text-3xl md:text-4xl font-bold text-gray-300">
                    {formatNumber(stats.nextBlind.sb)}
                  </span>
                  <span className="text-2xl text-gray-600">/</span>
                  <span className="font-mono text-3xl md:text-4xl font-bold text-gray-300">
                    {formatNumber(stats.nextBlind.bb)}
                  </span>
                </div>
                {stats.nextBlind.ante > 0 && (
                  <div className="mt-3 text-center text-base opacity-70">
                    <span className="text-gray-500">Ante: </span>
                    <span className="font-mono text-gray-400 font-bold">
                      {formatNumber(stats.nextBlind.ante)}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Stats Grid - Medium Importance */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="card p-5 text-center">
              <div className="text-xs uppercase tracking-widest text-gray-600 mb-2">Prize Pool</div>
              <div className="font-display text-4xl md:text-5xl font-bold text-emerald-400">
                {formatCurrency(stats?.totalPrizePool || 0)}
              </div>
              <div className="text-gray-600 text-xs mt-1">
                {formatCurrency(parseFloat(tournament.entry_price))} buy-in
              </div>
            </div>
            <div className="card p-5 text-center">
              <div className="text-xs uppercase tracking-widest text-gray-600 mb-2">Players</div>
              <div className="font-display text-4xl md:text-5xl font-bold">
                <span className="text-gold-400">{stats?.activeEntries || 0}</span>
                <span className="text-gray-600 mx-1">/</span>
                <span className="text-gray-400">{stats?.totalEntries || 0}</span>
              </div>
            </div>
            <div className="card p-5 text-center">
              <div className="text-xs uppercase tracking-widest text-gray-600 mb-2">Avg Stack</div>
              <div className="font-mono text-3xl md:text-4xl font-bold text-white">
                {formatNumber(stats?.averageStack || tournament.starting_stack)}
                {stats?.currentBlind?.bb > 0 && (
                  <span className="text-gold-400 text-2xl md:text-3xl ml-2">
                    ({Math.round((stats?.averageStack || tournament.starting_stack) / stats.currentBlind.bb)}BB)
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Side - Blinds Structure & Leaderboard (1/3 width) */}
        <div className="flex flex-col gap-6" style={{ width: '33.333%' }}>
          {/* Leaderboard */}
          {tournament.leaderboard && (
            <Leaderboard leaderboard={tournament.leaderboard} tournamentStatus={tournament.status} />
          )}
          
          {/* Blind Structure */}
          <div className="card p-6 overflow-hidden flex flex-col flex-1">
            <h2 className="font-display text-lg md:text-xl font-bold text-white mb-4 pb-3 border-b border-white/10">
              Blind Structure
            </h2>
            <div className="flex-1 overflow-y-auto">
              <div className="space-y-1">
                {blindStructure.map((level, index) => {
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
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 bg-casino-black/50 backdrop-blur-sm">
        <div className="max-w-[1920px] mx-auto px-8 py-3 flex items-center justify-between text-gray-500 text-xs md:text-sm">
          <div>♠ ♥ ♦ ♣ Poker Tournament Manager</div>
          <div className="font-mono">
            {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </footer>

      {/* Break Overlay */}
      {stats?.isBreak && isRunning && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center">
          <div className="text-center animate-float">
            <div className="text-9xl mb-8">☕</div>
            <h2 className="font-display text-6xl md:text-8xl gold-text mb-4">BREAK TIME</h2>
            <p className="text-3xl text-gray-400">{stats.breakMinutes} minute break</p>
            <div className={`timer-display text-8xl font-bold mt-8 ${timerColor}`}>
              {formatTime(localTimeRemaining)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
