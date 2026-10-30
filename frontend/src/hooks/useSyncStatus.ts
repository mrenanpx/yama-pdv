import { useState, useEffect } from 'react';
import { syncService, type SyncState } from '../services/syncService';

export function useSyncStatus(): SyncState & { forcarSincronizacao: () => Promise<void> } {
  const [state, setState] = useState<SyncState>(() => syncService.getState());

  useEffect(() => {
    const unsubscribe = syncService.subscribe((novoEstado) => {
      setState(novoEstado);
    });
    return () => unsubscribe();
  }, []);

  const forcarSincronizacao = async () => {
    await syncService.sincronizar();
  };

  return {
    ...state,
    forcarSincronizacao
  };
}

