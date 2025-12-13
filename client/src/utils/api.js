const API_BASE = '/api';

// Helper function to get auth headers
function getAuthHeaders(token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

export async function fetchTournaments(token) {
  const res = await fetch(`${API_BASE}/tournaments`, {
    headers: getAuthHeaders(token)
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error('Unauthorized. Please log in.');
    throw new Error('Failed to fetch tournaments');
  }
  return res.json();
}

export async function fetchTournament(id, token) {
  const res = await fetch(`${API_BASE}/tournaments/${id}`, {
    headers: getAuthHeaders(token)
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error('Unauthorized. Please log in.');
    if (res.status === 403) throw new Error('You do not have permission to access this tournament.');
    throw new Error('Failed to fetch tournament');
  }
  return res.json();
}

// Public endpoint for viewing tournaments (no auth required)
export async function fetchTournamentPublic(id) {
  const res = await fetch(`${API_BASE}/tournaments/${id}/public`);
  if (!res.ok) {
    if (res.status === 404) throw new Error('Tournament not found');
    throw new Error('Failed to fetch tournament');
  }
  return res.json();
}

export async function createTournament(data, token) {
  const res = await fetch(`${API_BASE}/tournaments`, {
    method: 'POST',
    headers: getAuthHeaders(token),
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error('Unauthorized. Please log in.');
    throw new Error('Failed to create tournament');
  }
  return res.json();
}

export async function deleteTournament(id, token) {
  const res = await fetch(`${API_BASE}/tournaments/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(token)
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error('Unauthorized. Please log in.');
    if (res.status === 403) throw new Error('You do not have permission to delete this tournament.');
    throw new Error('Failed to delete tournament');
  }
  return res.json();
}

export async function previewTournament(data) {
  const res = await fetch(`${API_BASE}/tournaments/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error('Failed to preview tournament');
  return res.json();
}

export async function updateTournamentStatus(id, status, token) {
  const res = await fetch(`${API_BASE}/tournaments/${id}/status`, {
    method: 'PATCH',
    headers: getAuthHeaders(token),
    body: JSON.stringify({ status })
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error('Unauthorized. Please log in.');
    if (res.status === 403) throw new Error('You do not have permission to update this tournament.');
    throw new Error('Failed to update status');
  }
  return res.json();
}

export async function advanceLevel(id, token) {
  const res = await fetch(`${API_BASE}/tournaments/${id}/next-level`, {
    method: 'PATCH',
    headers: getAuthHeaders(token)
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error('Unauthorized. Please log in.');
    if (res.status === 403) throw new Error('You do not have permission to modify this tournament.');
    throw new Error('Failed to advance level');
  }
  return res.json();
}

export async function skipBreak(id, token) {
  const res = await fetch(`${API_BASE}/tournaments/${id}/skip-break`, {
    method: 'PATCH',
    headers: getAuthHeaders(token)
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error('Unauthorized. Please log in.');
    if (res.status === 403) throw new Error('You do not have permission to modify this tournament.');
    throw new Error('Failed to skip break');
  }
  return res.json();
}

export async function addEntry(tournamentId, playerName, token) {
  const res = await fetch(`${API_BASE}/tournaments/${tournamentId}/entries`, {
    method: 'POST',
    headers: getAuthHeaders(token),
    body: JSON.stringify({ player_name: playerName })
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error('Unauthorized. Please log in.');
    if (res.status === 403) throw new Error('You do not have permission to modify this tournament.');
    const error = await res.json();
    throw new Error(error.error || 'Failed to add entry');
  }
  return res.json();
}

export async function recordKnockout(tournamentId, eliminatorId, eliminatedId, token) {
  const res = await fetch(`${API_BASE}/tournaments/${tournamentId}/knockouts`, {
    method: 'POST',
    headers: getAuthHeaders(token),
    body: JSON.stringify({
      eliminator_entry_id: eliminatorId,
      eliminated_entry_id: eliminatedId
    })
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error('Unauthorized. Please log in.');
    if (res.status === 403) throw new Error('You do not have permission to modify this tournament.');
    throw new Error('Failed to record knockout');
  }
  return res.json();
}

export function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
}

export function formatNumber(num) {
  return new Intl.NumberFormat('en-US').format(num);
}

export function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export function formatDateTime(date) {
  return new Date(date).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export async function exportTournamentSummary(id, token) {
  const res = await fetch(`${API_BASE}/tournaments/${id}/summary`, {
    headers: getAuthHeaders(token)
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error('Unauthorized. Please log in.');
    if (res.status === 403) throw new Error('You do not have permission to export this tournament.');
    throw new Error('Failed to export summary');
  }
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tournament-summary-${id}.txt`;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}
