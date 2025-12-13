import { useState, useEffect, useCallback } from 'react';
import { fetchTournament, fetchTournamentPublic } from '../utils/api';

export function useTournament(id, pollingInterval = 1000, token = null, isPublic = false) {
  const [tournament, setTournament] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!id) return;
    
    try {
      const data = isPublic 
        ? await fetchTournamentPublic(id)
        : await fetchTournament(id, token);
      setTournament(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id, token, isPublic]);

  useEffect(() => {
    load();
    
    const interval = setInterval(load, pollingInterval);
    return () => clearInterval(interval);
  }, [load, pollingInterval]);

  return { tournament, loading, error, refresh: load };
}

export function useTimer(initialTime, isRunning, onComplete) {
  const [time, setTime] = useState(initialTime);

  useEffect(() => {
    setTime(initialTime);
  }, [initialTime]);

  useEffect(() => {
    if (!isRunning || time <= 0) return;

    const interval = setInterval(() => {
      setTime(prev => {
        if (prev <= 1) {
          onComplete?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning, onComplete]);

  return time;
}
