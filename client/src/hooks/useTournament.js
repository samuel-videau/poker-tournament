import { useState, useEffect, useCallback } from 'react';
import { fetchTournament } from '../utils/api';

export function useTournament(id, pollingInterval = 1000) {
  const [tournament, setTournament] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!id) return;
    
    try {
      const data = await fetchTournament(id);
      setTournament(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

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
