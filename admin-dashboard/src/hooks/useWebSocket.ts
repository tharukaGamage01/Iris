'use client';

import { useEffect, useState } from 'react';

// WebSockets removed — provide a safe no-op hook for backward compatibility
export const useWebSocket = (_url: string = 'http://127.0.0.1:8001') => {
  const [isConnected, setIsConnected] = useState(false);
  useEffect(() => {
    // Always disabled in this build
    setIsConnected(false);
  }, []);

  const emit = (_event: string, _data: any) => {
    // no-op
  };

  const on = (_event: string, _callback: (data: any) => void) => {
    // no-op
  };

  const off = (_event: string, _callback?: (data: any) => void) => {
    // no-op
  };

  return {
    socket: null,
    isConnected,
    error: null,
    emit,
    on,
    off,
  };
};
