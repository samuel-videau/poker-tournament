import React from 'react';
import { formatNumber } from '../utils/api';

export default function BlindLevel({ level, label, size = 'normal', highlight = false }) {
  if (!level) return null;

  const sizeClasses = {
    small: 'text-base',
    normal: 'text-lg',
    large: 'text-2xl',
    xlarge: 'text-4xl md:text-5xl'
  };

  return (
    <div className={`${highlight ? 'text-gold-400' : 'text-white'}`}>
      {label && (
        <div className="text-xs uppercase tracking-widest text-gray-500 mb-1">
          {label}
        </div>
      )}
      <div className={`font-mono font-semibold ${sizeClasses[size]}`}>
        <span className="text-gold-400">{formatNumber(level.sb)}</span>
        <span className="text-gray-500 mx-1">/</span>
        <span className="text-gold-300">{formatNumber(level.bb)}</span>
        {level.ante > 0 && (
          <>
            <span className="text-gray-600 mx-2">|</span>
            <span className="text-emerald-400 text-[0.8em]">
              Ante {formatNumber(level.ante)}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
