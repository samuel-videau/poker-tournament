import React from 'react';

const CHIP_COLORS = {
  10: 'bg-gradient-to-br from-gray-100 to-gray-300 text-gray-800 border-gray-400',
  20: 'bg-gradient-to-br from-red-500 to-red-700 text-white border-red-400',
  50: 'bg-gradient-to-br from-green-500 to-green-700 text-white border-green-400',
  100: 'bg-gradient-to-br from-blue-600 to-blue-800 text-white border-blue-400',
  500: 'bg-gradient-to-br from-purple-600 to-purple-800 text-white border-purple-400'
};

export default function ChipStack({ distribution }) {
  if (!distribution || Object.keys(distribution).length === 0) return null;

  return (
    <div className="flex flex-wrap gap-3">
      {Object.entries(distribution)
        .sort((a, b) => parseInt(b[0]) - parseInt(a[0]))
        .map(([value, count]) => (
          <div key={value} className="flex items-center gap-2">
            <div 
              className={`
                w-10 h-10 rounded-full flex items-center justify-center
                font-mono font-bold text-xs border-2 shadow-lg
                ${CHIP_COLORS[value] || 'bg-gray-500 text-white border-gray-400'}
              `}
            >
              {value}
            </div>
            <span className="text-gray-400 text-sm">×{count}</span>
          </div>
        ))}
    </div>
  );
}
