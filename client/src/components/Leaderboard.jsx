import React from 'react';
import { formatCurrency } from '../utils/api';

export default function Leaderboard({ leaderboard, tournamentStatus, tournamentType }) {
  if (!leaderboard || !leaderboard.rankings || leaderboard.rankings.length === 0) {
    return null;
  }

  const { rankings, totalBountiesPaid, prizePool } = leaderboard;
  const isEnded = tournamentStatus === 'ended';
  const isPKO = tournamentType === 'pko';

  // Get position emoji/icon
  const getPositionIcon = (position) => {
    if (position === 1) return '🥇';
    if (position === 2) return '🥈';
    if (position === 3) return '🥉';
    return `${position}.`;
  };

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/10">
        <h3 className="font-display text-lg md:text-xl font-bold text-white">
          Leaderboard
        </h3>
        {isEnded && (
          <div className="text-sm text-gray-400">
            Prize Pool: {formatCurrency(prizePool)}
            {totalBountiesPaid > 0 && (
              <span className="ml-2 text-amber-400">
                (Bounties: {formatCurrency(totalBountiesPaid)})
              </span>
            )}
          </div>
        )}
      </div>
      
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {rankings.map((player) => (
          <div
            key={player.entry_id}
            className={`p-3 rounded-lg transition-all ${
              player.is_eliminated
                ? 'bg-casino-black/30 opacity-60'
                : 'bg-casino-black/50 border border-gold-500/20'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <span className="text-lg font-bold text-gold-400 flex-shrink-0">
                  {getPositionIcon(player.position)}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`font-medium ${
                      player.is_eliminated ? 'text-gray-500 line-through' : 'text-white'
                    }`}>
                      {player.player_name}
                    </span>
                    {player.entry_number > 1 && (
                      <span className="text-xs px-2 py-0.5 bg-amber-600/30 text-amber-400 rounded flex-shrink-0">
                        Re-entry #{player.entry_number}
                      </span>
                    )}
                    {!player.is_eliminated && (
                      <span className="text-xs px-2 py-0.5 bg-emerald-600/30 text-emerald-400 rounded flex-shrink-0">
                        Active
                      </span>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-4 flex-shrink-0">
                {isPKO && !player.is_eliminated && player.current_bounty > 0 && (
                  <div className="text-right">
                    <div className="text-xs text-gray-500">Bounty</div>
                    <div className="text-sm font-bold text-amber-400">
                      {formatCurrency(player.current_bounty)}
                    </div>
                  </div>
                )}
                {player.bounty_collected > 0 && (
                  <div className="text-right">
                    <div className="text-xs text-gray-500">Collected</div>
                    <div className="text-sm font-bold text-emerald-400">
                      +{formatCurrency(player.bounty_collected)}
                    </div>
                  </div>
                )}
                <div className="text-right min-w-[100px]">
                  {isEnded ? (
                    <>
                      <div className="text-xs text-gray-500">Prize</div>
                      <div className={`text-sm font-bold ${
                        player.prize > 0 ? 'text-gold-400' : 'text-gray-500'
                      }`}>
                        {player.prize > 0 ? formatCurrency(player.prize) : '—'}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-xs text-gray-500">Prize</div>
                      <div className="text-sm font-bold text-gray-500">
                        —
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      
      {isEnded && rankings.some(p => p.prize > 0) && (
        <div className="mt-4 pt-4 border-t border-white/10">
          <div className="text-center">
            <div className="text-sm text-gray-400 mb-2">Payout Summary</div>
            <div className="space-y-1">
              {rankings.filter(p => p.prize > 0).map((player) => (
                <div key={player.entry_id} className="flex items-center justify-center gap-2">
                  <span className="text-sm text-gray-500">
                    {getPositionIcon(player.position)} {player.player_name}:
                  </span>
                  <span className="text-lg font-bold text-gold-400">
                    {formatCurrency(player.prize)}
                  </span>
                </div>
              ))}
            </div>
            <div className="text-xs text-gray-500 mt-2">
              Prize Pool ({formatCurrency(prizePool)}) - Bounties ({formatCurrency(totalBountiesPaid)})
            </div>
          </div>
        </div>
      )}
    </div>
  );
}








