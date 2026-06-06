import { useState, useEffect } from 'react';

export function useFlash(changedKeys: string[], duration = 300): Set<string> {
  const [flashing, setFlashing] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (changedKeys.length === 0) return;
    setFlashing(new Set(changedKeys));
    const timer = setTimeout(() => setFlashing(new Set()), duration);
    return () => clearTimeout(timer);
  }, [changedKeys, duration]);

  return flashing;
}
