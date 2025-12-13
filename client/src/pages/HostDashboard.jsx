import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { fetchTournaments, deleteTournament, formatCurrency, formatDateTime } from '../utils/api';
import TournamentForm from '../components/TournamentForm';
import { trackTournamentCreated } from '../utils/analytics';

const STATUS_COLORS = {
  pending: 'badge-pending',
  running: 'badge-running',
  paused: 'badge-paused',
  ended: 'badge-ended'
};

const TYPE_LABELS = {
  icm: 'ICM',
  ko: 'Knockout',
  mystery_ko: 'Mystery KO'
};

export default function HostDashboard() {
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const navigate = useNavigate();
  const { user, token, signOut } = useAuth();

  useEffect(() => {
    if (token) {
      loadTournaments();
    }
  }, [token]);

  const loadTournaments = async () => {
    try {
      const data = await fetchTournaments(token);
      // Filter to only show tournaments owned by current user
      setTournaments(data.filter(t => t.owner === user.uid));
    } catch (err) {
      console.error('Failed to load tournaments:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreated = (tournament) => {
    setShowForm(false);
    trackTournamentCreated(tournament.id, tournament.name);
    navigate(`/host/game/${tournament.id}`);
  };

  const handleDelete = async (id, e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!confirm('Are you sure you want to delete this tournament?')) return;
    
    try {
      await deleteTournament(id, token);
      setTournaments(prev => prev.filter(t => t.id !== id));
    } catch (err) {
      console.error('Failed to delete tournament:', err);
      alert(err.message || 'Failed to delete tournament');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-casino-dark to-casino-black">
      {/* Header */}
      <header className="border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-display text-3xl font-bold gold-text">
                ♠ Tournament Manager
              </h1>
              <p className="text-gray-500 mt-1">Host Dashboard</p>
            </div>
            <div className="flex items-center gap-4">
              {user && (
                <div className="flex items-center gap-3">
                  {user.photoURL && (
                    <img 
                      src={user.photoURL} 
                      alt={user.displayName || 'User'} 
                      className="w-8 h-8 rounded-full"
                    />
                  )}
                  <span className="text-gray-400 text-sm">{user.displayName || user.email}</span>
                </div>
              )}
              <button
                onClick={() => setShowForm(true)}
                className="btn btn-gold"
              >
                + New Tournament
              </button>
              <button
                onClick={signOut}
                className="btn btn-outline"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Create Tournament Modal */}
        {showForm && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="card max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
              <h2 className="font-display text-2xl gold-text mb-6">Create New Tournament</h2>
              <TournamentForm 
                onCreated={handleCreated} 
                onCancel={() => setShowForm(false)}
                token={token}
              />
            </div>
          </div>
        )}

        {/* Tournament List */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-gold-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : tournaments.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">🎰</div>
            <h2 className="text-2xl font-display text-gray-400 mb-2">No Tournaments Yet</h2>
            <p className="text-gray-600 mb-6">Create your first tournament to get started</p>
            <button onClick={() => setShowForm(true)} className="btn btn-gold">
              Create Tournament
            </button>
          </div>
        ) : (
          <div className="grid gap-4">
            {tournaments.map(tournament => (
              <Link
                key={tournament.id}
                to={`/host/game/${tournament.id}`}
                className="card card-hover p-5 block group"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-display text-xl text-white group-hover:text-gold-400 transition-colors">
                        {tournament.name}
                      </h3>
                      <span className={`badge ${STATUS_COLORS[tournament.status]}`}>
                        {tournament.status}
                      </span>
                    </div>
                    
                    <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-gray-400">
                      <span className="flex items-center gap-1">
                        <span className="text-gold-500">♦</span>
                        {TYPE_LABELS[tournament.type]}
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="text-gold-500">👥</span>
                        {tournament.max_players} players
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="text-gold-500">💰</span>
                        {formatCurrency(tournament.entry_price)} buy-in
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="text-gold-500">⏱</span>
                        {tournament.speed}
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="text-gray-600">📅</span>
                        {formatDateTime(tournament.created_at)}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <Link
                      to={`/display/${tournament.id}`}
                      target="_blank"
                      onClick={(e) => e.stopPropagation()}
                      className="text-gray-500 hover:text-gold-400 transition-colors text-sm"
                    >
                      Open Display ↗
                    </Link>
                    <button
                      onClick={(e) => handleDelete(tournament.id, e)}
                      className="text-gray-600 hover:text-red-500 transition-colors"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 mt-auto">
        <div className="max-w-7xl mx-auto px-6 py-4 text-center text-gray-600 text-sm">
          Poker Tournament Manager • Use /display/:id for player-facing screen
        </div>
      </footer>
    </div>
  );
}
