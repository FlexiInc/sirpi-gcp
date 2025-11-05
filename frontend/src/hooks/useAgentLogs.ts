import { useEffect, useRef, useState } from 'react';

export interface AgentLog {
  agent: string;
  stage: string;
  content: string;
  timestamp: string;
}

interface UseAgentLogsOptions {
  sessionId: string | null;
  enabled?: boolean;
}

/**
 * Hook to stream agent thinking logs from Google ADK session state.
 * Provides real-time visibility into what agents are thinking/doing.
 * Prevents auto-reconnect after workflow completion.
 */
export function useAgentLogs({ sessionId, enabled = true }: UseAgentLogsOptions) {
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const eventSourceRef = useRef<EventSource | null>(null);
  const logsRef = useRef<AgentLog[]>([]);
  const isCompleteRef = useRef(false); // Track completion to prevent reconnect
  
  useEffect(() => {
    // Clean up any existing EventSource
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    // Don't create connection if disabled, no session, or already complete
    if (!enabled || !sessionId || isCompleteRef.current) {
      return;
    }

    setIsConnected(false);
    setError(null);

    // Create EventSource for agent thinking logs
    const eventSource = new EventSource(
      `${process.env.NEXT_PUBLIC_API_URL}/api/v1/workflows/agent-logs/${sessionId}`
    );

    eventSource.onopen = () => {
      setIsConnected(true);
    };

    // Handle connection confirmation
    eventSource.addEventListener('connected', (event) => {
      try {
        const data = JSON.parse(event.data);
        setIsConnected(true);
      } catch (err) {
        console.error('[Agent Logs] Failed to parse connected event:', err);
      }
    });

    // Handle agent log events
    eventSource.addEventListener('agent_log', (event) => {
      try {
        const logData = JSON.parse(event.data) as AgentLog;
        
        // Check if this is a completion/failure log from orchestrator
        if (logData.agent === 'orchestrator' && (logData.stage === 'completed' || logData.stage === 'failed')) {
          isCompleteRef.current = true;
          
          // Close connection after brief delay to ensure final log is displayed
          setTimeout(() => {
            if (eventSource.readyState !== EventSource.CLOSED) {
              eventSource.close();
            }
            setIsConnected(false);
          }, 1000);
        }
        
        // Add to logs array
        logsRef.current = [...logsRef.current, logData];
        setLogs(logsRef.current);
      } catch (err) {
        console.error('[Agent Logs] Failed to parse agent_log:', err);
      }
    });

    // Handle error events
    eventSource.addEventListener('error', (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data);
        console.error('[Agent Logs] Error event:', data);
        setError(data.error || 'Stream error');
        setIsConnected(false);
      } catch {
        // Ignore parse errors for network errors
        if (eventSource.readyState === EventSource.CLOSED) {
          setIsConnected(false);
        }
      }
    });

    eventSource.onerror = (err) => {
      console.error('[Agent Logs] Connection error:', err);
      
      if (eventSource.readyState === EventSource.CLOSED) {
        setIsConnected(false);
        // Only set error if not already complete
        if (!isCompleteRef.current) {
          setError('Connection lost');
        }
      }
    };

    eventSourceRef.current = eventSource;

    // Cleanup on unmount
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      setIsConnected(false);
    };
  }, [enabled, sessionId]);

  const clearLogs = () => {
    logsRef.current = [];
    setLogs([]);
    isCompleteRef.current = false; // Reset completion state
  };

  return {
    logs,
    isConnected,
    error,
    clearLogs,
  };
}
