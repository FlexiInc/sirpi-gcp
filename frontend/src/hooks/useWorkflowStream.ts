import { useEffect, useRef, useState } from 'react';

interface UseWorkflowStreamOptions {
  sessionId: string | null;
  onLog: (agent: string, message: string, level?: string) => void;
  onComplete: (status: 'completed' | 'failed', files?: any[], error?: string) => void;
  enabled: boolean;
}

export function useWorkflowStream({
  sessionId,
  onLog,
  onComplete,
  enabled,
}: UseWorkflowStreamOptions) {
  const [isStreaming, setIsStreaming] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const completedRef = useRef(false);
  
  // Store callbacks in refs to avoid recreating on every render
  const onLogRef = useRef(onLog);
  const onCompleteRef = useRef(onComplete);
  
  useEffect(() => {
    onLogRef.current = onLog;
    onCompleteRef.current = onComplete;
  }, [onLog, onComplete]);

  useEffect(() => {
    // Clean up any existing EventSource
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    if (!enabled || !sessionId || completedRef.current) {
      return;
    }

    console.log(`[SSE] Starting stream for session ${sessionId}`);
    setIsStreaming(true);
    completedRef.current = false;

    // Create EventSource for Server-Sent Events
    const eventSource = new EventSource(
      `${process.env.NEXT_PUBLIC_API_URL}/api/v1/workflows/stream/${sessionId}`
    );

    eventSource.onopen = () => {
      console.log('[SSE] Connection opened');
    };

    // Handle status events
    eventSource.addEventListener('status', (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('[SSE] Status:', data);
      } catch (error) {
        console.error('[SSE] Failed to parse status:', error);
      }
    });

    // Handle log events
    eventSource.addEventListener('log', (event) => {
      try {
        const data = JSON.parse(event.data);
        onLogRef.current(data.agent, data.message, data.level);
      } catch (error) {
        console.error('[SSE] Failed to parse log:', error);
      }
    });

    // Handle completion events
    eventSource.addEventListener('complete', (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('[SSE] Complete:', data);
        
        completedRef.current = true;
        setIsStreaming(false);
        
        onCompleteRef.current(
          data.status as 'completed' | 'failed',
          data.files,
          data.error
        );
        
        eventSource.close();
      } catch (error) {
        console.error('[SSE] Failed to parse completion:', error);
      }
    });

    // Handle errors
    eventSource.addEventListener('error', (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data);
        console.error('[SSE] Error event:', data);
        
        completedRef.current = true;
        setIsStreaming(false);
        
        onCompleteRef.current('failed', undefined, data.error || 'Stream error');
        
        eventSource.close();
      } catch {
        console.error('[SSE] Connection error');
        
        // Network error or connection closed
        if (eventSource.readyState === EventSource.CLOSED) {
          completedRef.current = true;
          setIsStreaming(false);
        }
      }
    });

    eventSource.onerror = () => {
      console.error('[SSE] Connection error occurred');
      
      if (eventSource.readyState === EventSource.CLOSED && !completedRef.current) {
        completedRef.current = true;
        setIsStreaming(false);
        onCompleteRef.current('failed', undefined, 'Connection lost');
      }
    };

    eventSourceRef.current = eventSource;

    // Cleanup on unmount
    return () => {
      console.log('[SSE] Cleanup - closing connection');
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      setIsStreaming(false);
    };
  }, [enabled, sessionId]);

  const stopStream = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsStreaming(false);
    completedRef.current = true;
  };

  return {
    isStreaming,
    stopStream,
  };
}
