import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useTournament, useTimer } from '../hooks/useTournament';
import { formatCurrency, formatNumber, formatTime, advanceLevel } from '../utils/api';

export default function PublicDisplay() {
  const { id } = useParams();
  const { tournament, loading, error, refresh } = useTournament(id, 500); // Poll every 500ms for smoother updates
  const audioRef = useRef(null);
  const [playedLevelEnd, setPlayedLevelEnd] = useState(false);

  // Calculate local time remaining
  const [localTimeRemaining, setLocalTimeRemaining] = useState(0);
  
  useEffect(() => {
    if (!tournament?.stats) return;
    setLocalTimeRemaining(tournament.stats.timeRemaining);
    setPlayedLevelEnd(false);
  }, [tournament?.current_level]);

  // Local countdown for smooth display
  useEffect(() => {
    if (tournament?.status !== 'running') return;
    
    const interval = setInterval(() => {
      setLocalTimeRemaining(prev => {
        if (prev <= 1) {
          // Play sound and trigger level change
          if (!playedLevelEnd) {
            audioRef.current?.play().catch(() => {});
            setPlayedLevelEnd(true);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [tournament?.status, playedLevelEnd]);

  // Sync with server time periodically
  useEffect(() => {
    if (tournament?.stats?.timeRemaining !== undefined) {
      // Only sync if difference is more than 2 seconds
      const diff = Math.abs(localTimeRemaining - tournament.stats.timeRemaining);
      if (diff > 2) {
        setLocalTimeRemaining(tournament.stats.timeRemaining);
      }
    }
  }, [tournament?.stats?.timeRemaining]);

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

  return (
    <div className="min-h-screen animated-bg felt-bg public-display overflow-hidden">
      {/* Audio for level change */}
      <audio ref={audioRef} src="data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj2a2teleUUnVo7C3dB6STZjmt7g3Yxma3OOo6qxrJuWkH9gPDpAVnOAenpYQzQAAAAA" />
      
      {/* Header */}
      <header className="relative z-10 px-8 py-6 flex items-center justify-between border-b border-white/10">
        <div>
          <h1 className="font-display text-4xl md:text-5xl font-bold gold-text">
            {tournament.name}
          </h1>
          <p className="text-gray-400 text-lg mt-1 capitalize">
            {tournament.type.replace('_', ' ')} • {tournament.speed} Speed
          </p>
        </div>
        
        <div className="text-right">
          {isPending && (
            <div className="text-2xl text-gray-400 font-display">
              ⏳ Waiting to Start
            </div>
          )}
          {isPaused && (
            <div className="text-3xl text-amber-400 font-display animate-pulse">
              ⏸ PAUSED
            </div>
          )}
          {isEnded && (
            <div className="text-3xl text-red-400 font-display">
              🏆 TOURNAMENT ENDED
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 px-8 py-6 h-[calc(100vh-140px)] flex flex-col">
        {/* Top Row - Prize Pool and Timer */}
        <div className="grid md:grid-cols-3 gap-6 mb-6">
          {/* Prize Pool */}
          <div className="card p-6 text-center">
            <div className="text-sm uppercase tracking-widest text-gray-500 mb-2">Total Prize Pool</div>
            <div className="font-display text-5xl md:text-6xl font-bold text-emerald-400 prize-glow">
              {formatCurrency(stats?.totalPrizePool || 0)}
            </div>
            <div className="text-gray-500 mt-2">
              {formatCurrency(parseFloat(tournament.entry_price))} buy-in
            </div>
          </div>

          {/* Timer - Center Focus */}
          <div className="card p-6 text-center">
            <div className="text-sm uppercase tracking-widest text-gray-500 mb-2">
              {stats?.isBreak ? 'Break Time' : `Level ${tournament.current_level}`}
            </div>
            <div className={`timer-display text-7xl md:text-8xl font-bold ${timerColor}`}>
              {formatTime(localTimeRemaining)}
            </div>
            <div className="text-gray-500 mt-2">
              {stats?.levelMinutes} minute levels
            </div>
          </div>

          {/* Entries */}
          <div className="card p-6 text-center">
            <div className="text-sm uppercase tracking-widest text-gray-500 mb-2">Players Remaining</div>
            <div className="font-display text-5xl md:text-6xl font-bold">
              <span className="text-gold-400">{stats?.activeEntries || 0}</span>
              <span className="text-gray-600 mx-2">/</span>
              <span className="text-gray-400">{stats?.totalEntries || 0}</span>
            </div>
            <div className="text-gray-500 mt-2">
              entries
            </div>
          </div>
        </div>

        {/* Middle Row - Blinds */}
        <div className="grid md:grid-cols-2 gap-6 flex-1">
          {/* Current Blinds */}
          <div className="card p-8 flex flex-col justify-center">
            <div className="text-sm uppercase tracking-widest text-gray-500 mb-4">Current Blinds</div>
            <div className="flex items-baseline gap-4">
              <span className="font-mono text-6xl md:text-7xl font-bold text-gold-400">
                {formatNumber(stats?.currentBlind?.sb || 0)}
              </span>
              <span className="text-4xl text-gray-600">/</span>
              <span className="font-mono text-6xl md:text-7xl font-bold text-gold-300">
                {formatNumber(stats?.currentBlind?.bb || 0)}
              </span>
            </div>
            {stats?.currentBlind?.ante > 0 && (
              <div className="mt-4 text-3xl">
                <span className="text-gray-500">Ante: </span>
                <span className="font-mono text-emerald-400 font-bold">
                  {formatNumber(stats.currentBlind.ante)}
                </span>
              </div>
            )}
          </div>

          {/* Next Blinds */}
          <div className="card p-8 flex flex-col justify-center bg-casino-gray/50">
            <div className="text-sm uppercase tracking-widest text-gray-500 mb-4">Next Level</div>
            {stats?.nextBlind ? (
              <>
                <div className="flex items-baseline gap-4 opacity-70">
                  <span className="font-mono text-5xl md:text-6xl font-bold text-gray-300">
                    {formatNumber(stats.nextBlind.sb)}
                  </span>
                  <span className="text-3xl text-gray-600">/</span>
                  <span className="font-mono text-5xl md:text-6xl font-bold text-gray-300">
                    {formatNumber(stats.nextBlind.bb)}
                  </span>
                </div>
                {stats.nextBlind.ante > 0 && (
                  <div className="mt-4 text-2xl opacity-70">
                    <span className="text-gray-500">Ante: </span>
                    <span className="font-mono text-gray-400 font-bold">
                      {formatNumber(stats.nextBlind.ante)}
                    </span>
                  </div>
                )}
              </>
            ) : (
              <div className="text-2xl text-gray-600">Final Level</div>
            )}
          </div>
        </div>

        {/* Bottom Row - Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          <div className="card p-4 text-center">
            <div className="text-xs uppercase tracking-widest text-gray-600">Average Stack</div>
            <div className="font-mono text-2xl md:text-3xl font-bold text-white mt-1">
              {formatNumber(stats?.averageStack || tournament.starting_stack)}
            </div>
          </div>
          <div className="card p-4 text-center">
            <div className="text-xs uppercase tracking-widest text-gray-600">Starting Stack</div>
            <div className="font-mono text-2xl md:text-3xl font-bold text-gray-400 mt-1">
              {formatNumber(tournament.starting_stack)}
            </div>
          </div>
          <div className="card p-4 text-center">
            <div className="text-xs uppercase tracking-widest text-gray-600">Big Blinds (Avg)</div>
            <div className="font-mono text-2xl md:text-3xl font-bold text-gold-400 mt-1">
              {stats?.currentBlind?.bb > 0 
                ? Math.round((stats?.averageStack || tournament.starting_stack) / stats.currentBlind.bb)
                : '∞'
              } BB
            </div>
          </div>
          <div className="card p-4 text-center">
            <div className="text-xs uppercase tracking-widest text-gray-600">Buy-in</div>
            <div className="font-mono text-2xl md:text-3xl font-bold text-emerald-400 mt-1">
              {formatCurrency(parseFloat(tournament.entry_price))}
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 px-8 py-3 border-t border-white/10 flex items-center justify-between text-gray-500 text-sm">
        <div>♠ ♥ ♦ ♣ Poker Tournament Manager</div>
        <div className="font-mono">
          {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
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
