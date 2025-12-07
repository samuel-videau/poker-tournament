import React, { useState, useEffect } from 'react';
import { createTournament, previewTournament, formatNumber, formatCurrency } from '../utils/api';
import ChipStack from './ChipStack';
import BlindLevel from './BlindLevel';

const SPEEDS = [
  { value: 'turbo', label: 'Turbo', desc: '10 min levels' },
  { value: 'normal', label: 'Normal', desc: '20 min levels' },
  { value: 'slow', label: 'Slow', desc: '30 min levels' }
];

const TYPES = [
  { value: 'icm', label: 'ICM', desc: 'Standard payout structure' },
  { value: 'ko', label: 'Knockout', desc: '50% bounty on eliminations' },
  { value: 'mystery_ko', label: 'Mystery KO', desc: 'Random bounty multipliers' }
];

const BLIND_DEPTHS = [
  { value: 30, label: 'Shallow', desc: '30 BB' },
  { value: 50, label: 'Standard', desc: '50 BB' },
  { value: 75, label: 'Deep', desc: '75 BB' },
  { value: 100, label: 'Very Deep', desc: '100 BB' },
  { value: 150, label: 'Ultra Deep', desc: '150 BB' }
];

const BLIND_INCREASES = [
  { value: 1.15, label: 'Very Slow', desc: '1.15x' },
  { value: 1.2, label: 'Slow', desc: '1.2x' },
  { value: 1.25, label: 'Standard', desc: '1.25x' },
  { value: 1.3, label: 'Fast', desc: '1.3x' },
  { value: 1.4, label: 'Very Fast', desc: '1.4x' },
  { value: 1.5, label: 'Turbo', desc: '1.5x' },
  { value: 1.75, label: 'Hyper', desc: '1.75x' },
  { value: 2.0, label: 'Ultra', desc: '2.0x' }
];

export default function TournamentForm({ onCreated, onCancel }) {
  const [formData, setFormData] = useState({
    name: '',
    speed: 'normal',
    max_players: 8,
    max_reentries: 1,
    type: 'icm',
    entry_price: 20,
    starting_blind_depth: 50,
    blind_increase_rate: 1.25,
    bba_start_level: 6
  });
  
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Fetch preview when form changes
  useEffect(() => {
    const fetchPreview = async () => {
      try {
        const data = await previewTournament({
          speed: formData.speed,
          max_players: formData.max_players,
          max_reentries: formData.max_reentries,
          entry_price: formData.entry_price,
          starting_blind_depth: formData.starting_blind_depth,
          blind_increase_rate: formData.blind_increase_rate,
          bba_start_level: formData.bba_start_level
        });
        setPreview(data);
      } catch (err) {
        console.error('Preview error:', err);
      }
    };
    
    fetchPreview();
  }, [formData.speed, formData.max_players, formData.max_reentries, formData.entry_price, formData.starting_blind_depth, formData.blind_increase_rate, formData.bba_start_level]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    try {
      const tournament = await createTournament(formData);
      onCreated(tournament);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const updateField = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-4 bg-red-900/50 border border-red-500/50 rounded-lg text-red-200">
          {error}
        </div>
      )}
      
      {/* Tournament Name */}
      <div>
        <label className="block text-sm font-medium text-gray-400 mb-2">
          Tournament Name
        </label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => updateField('name', e.target.value)}
          className="input"
          placeholder="Friday Night Poker"
          required
        />
      </div>

      {/* Speed Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-400 mb-2">
          Speed
        </label>
        <div className="grid grid-cols-3 gap-3">
          {SPEEDS.map(speed => (
            <button
              key={speed.value}
              type="button"
              onClick={() => updateField('speed', speed.value)}
              className={`
                p-4 rounded-lg border text-center transition-all
                ${formData.speed === speed.value 
                  ? 'border-gold-500 bg-gold-500/10 text-gold-400' 
                  : 'border-white/10 hover:border-white/30 text-gray-300'}
              `}
            >
              <div className="font-semibold">{speed.label}</div>
              <div className="text-xs text-gray-500 mt-1">{speed.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Type Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-400 mb-2">
          Tournament Type
        </label>
        <div className="grid grid-cols-3 gap-3">
          {TYPES.map(type => (
            <button
              key={type.value}
              type="button"
              onClick={() => updateField('type', type.value)}
              className={`
                p-4 rounded-lg border text-center transition-all
                ${formData.type === type.value 
                  ? 'border-gold-500 bg-gold-500/10 text-gold-400' 
                  : 'border-white/10 hover:border-white/30 text-gray-300'}
              `}
            >
              <div className="font-semibold">{type.label}</div>
              <div className="text-xs text-gray-500 mt-1">{type.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Starting Blind Depth Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-400 mb-2">
          Starting Stack Depth
        </label>
        <div className="grid grid-cols-5 gap-2">
          {BLIND_DEPTHS.map(depth => (
            <button
              key={depth.value}
              type="button"
              onClick={() => updateField('starting_blind_depth', depth.value)}
              className={`
                p-3 rounded-lg border text-center transition-all
                ${formData.starting_blind_depth === depth.value 
                  ? 'border-gold-500 bg-gold-500/10 text-gold-400' 
                  : 'border-white/10 hover:border-white/30 text-gray-300'}
              `}
            >
              <div className="font-semibold text-sm">{depth.label}</div>
              <div className="text-xs text-gray-500 mt-1">{depth.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Blind Increase Rate Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-400 mb-2">
          Blind Increase Rate
        </label>
        <div className="grid grid-cols-4 gap-2">
          {BLIND_INCREASES.map(increase => (
            <button
              key={increase.value}
              type="button"
              onClick={() => updateField('blind_increase_rate', increase.value)}
              className={`
                p-3 rounded-lg border text-center transition-all
                ${formData.blind_increase_rate === increase.value 
                  ? 'border-gold-500 bg-gold-500/10 text-gold-400' 
                  : 'border-white/10 hover:border-white/30 text-gray-300'}
              `}
            >
              <div className="font-semibold text-sm">{increase.label}</div>
              <div className="text-xs text-gray-500 mt-1">{increase.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* BBA Start Level */}
      <div>
        <label className="block text-sm font-medium text-gray-400 mb-2">
          Big Blind Ante (BBA) Start Level
        </label>
        <select
          value={formData.bba_start_level}
          onChange={(e) => updateField('bba_start_level', parseInt(e.target.value))}
          className="select"
        >
          {[3, 4, 5, 6, 7, 8, 9, 10, 12, 15].map(n => (
            <option key={n} value={n}>Level {n}</option>
          ))}
        </select>
        <p className="text-xs text-gray-500 mt-1">
          BBA equals the big blind. The big blind player pays both BB and ante.
        </p>
      </div>

      {/* Number inputs row */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-2">
            Max Players
          </label>
          <select
            value={formData.max_players}
            onChange={(e) => updateField('max_players', parseInt(e.target.value))}
            className="select"
          >
            {[4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 18, 20].map(n => (
              <option key={n} value={n}>{n} players</option>
            ))}
          </select>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-2">
            Max Re-entries
          </label>
          <select
            value={formData.max_reentries}
            onChange={(e) => updateField('max_reentries', parseInt(e.target.value))}
            className="select"
          >
            {[0, 1, 2, 3, 5, 10].map(n => (
              <option key={n} value={n}>{n === 0 ? 'None' : n}</option>
            ))}
          </select>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-2">
            Entry Price
          </label>
          <select
            value={formData.entry_price}
            onChange={(e) => updateField('entry_price', parseFloat(e.target.value))}
            className="select"
          >
            {[5, 10, 15, 20, 25, 30, 40, 50, 75, 100, 150, 200].map(n => (
              <option key={n} value={n}>${n}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Preview Section */}
      {preview && (
        <div className="p-5 bg-casino-black/50 rounded-xl border border-white/5 space-y-4">
          <h3 className="font-display text-lg gold-text">Tournament Preview</h3>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-gray-500 text-xs uppercase tracking-wider">Starting Stack</div>
              <div className="text-xl font-mono text-gold-400">{formatNumber(preview.startingStack)}</div>
            </div>
            <div>
              <div className="text-gray-500 text-xs uppercase tracking-wider">Prize Pool</div>
              <div className="text-xl font-mono text-emerald-400">{formatCurrency(preview.prizePool)}</div>
            </div>
            <div>
              <div className="text-gray-500 text-xs uppercase tracking-wider">Level Duration</div>
              <div className="text-xl font-mono text-white">{preview.levelMinutes} min</div>
            </div>
            <div>
              <div className="text-gray-500 text-xs uppercase tracking-wider">Est. Duration</div>
              <div className="text-xl font-mono text-white">{preview.estimatedDuration}</div>
            </div>
          </div>

          {/* Chip Distribution */}
          <div>
            <div className="text-gray-500 text-xs uppercase tracking-wider mb-2">Chip Distribution</div>
            <ChipStack distribution={preview.chipDistribution} />
          </div>

          {/* Blind levels */}
          <div>
            <div className="text-gray-500 text-xs uppercase tracking-wider mb-2">Blind Structure</div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {preview.blindLevels.map((level, i) => (
                <div key={i} className="p-2 bg-casino-gray/50 rounded text-center">
                  <div className="text-xs text-gray-500">Level {i + 1}</div>
                  <div className="font-mono text-sm">
                    <span className="text-gold-400">{level.sb}</span>
                    <span className="text-gray-600">/</span>
                    <span className="text-gold-300">{level.bb}</span>
                  </div>
                  {level.ante > 0 && (
                    <div className="text-xs text-emerald-500">A: {level.ante}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-4 pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="btn btn-outline flex-1"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading || !formData.name}
          className="btn btn-gold flex-1"
        >
          {loading ? 'Creating...' : 'Create Tournament'}
        </button>
      </div>
    </form>
  );
}
