import { useEffect, useRef, useCallback, useState } from 'react';

interface UseDeploymentPollingOptions {
  operationId: string | null;
  onLog: (message: string) => void;
  onComplete: (status: 'completed' | 'failed', error?: string) => void;
  enabled: boolean;
}

export function useDeploymentPolling({
  operationId,
  onLog,
  onComplete,
  enabled,
}: UseDeploymentPollingOptions) {
  const [isPolling, setIsPolling] = useState(false);
  const lastLogIndexRef = useRef(0);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const completedRef = useRef(false);
  const operationIdRef = useRef<string | null>(null);
  
  // Store callbacks in refs to avoid recreating pollLogs on every render
  const onLogRef = useRef(onLog);
  const onCompleteRef = useRef(onComplete);
  
  // Update refs when callbacks change
  useEffect(() => {
    onLogRef.current = onLog;
    onCompleteRef.current = onComplete;
  }, [onLog, onComplete]);

  const pollLogs = useCallback(async () => {
    const currentOperationId = operationIdRef.current;
    if (!currentOperationId || completedRef.current) return;


    try {
      // Get Clerk token
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const token = await (window as any).Clerk?.session?.getToken();
      if (!token) return;

      // Fetch logs since last index
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/deployment/operations/${currentOperationId}/logs?since_index=${lastLogIndexRef.current}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        console.error('Failed to fetch logs:', response.statusText);
        return;
      }

      const data = await response.json();
      
      if (data.success && data.data) {
        const { logs, next_index, completed, status, error } = data.data;


        // Update last index IMMEDIATELY before processing logs
        lastLogIndexRef.current = next_index;

        // Add new logs one by one (no delay - they're already batched by polling interval)
        logs.forEach((log: string) => {
          onLogRef.current(log);
        });

        // Check if completed
        if (completed) {
          completedRef.current = true;
          setIsPolling(false);
          onCompleteRef.current(status, error);
          
          // Clear interval
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
        }
      }
    } catch (error) {
      console.error('Polling error:', error);
    }
  }, []); // Empty dependencies - use refs for callbacks

  useEffect(() => {
    
    // Clear any existing interval first
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    if (enabled && operationId) {
      // Reset state for new operation
      operationIdRef.current = operationId;
      lastLogIndexRef.current = 0;
      completedRef.current = false;
      setIsPolling(true);

      // Start polling immediately
      pollLogs();

      // Then poll every 2 seconds (more readable, less API load)
      pollIntervalRef.current = setInterval(pollLogs, 1000);
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      setIsPolling(false);
    };
  }, [enabled, operationId]); // Remove pollLogs from dependencies!

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    setIsPolling(false);
    completedRef.current = true;
  }, []);

  return {
    isPolling,
    stopPolling,
  };
}
