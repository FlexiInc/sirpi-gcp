/**
 * Hook to check GCP credentials status
 * Validates if user's OAuth tokens are fresh and valid
 */

import { useEffect, useState } from 'react';
import { apiCall } from '@/lib/api-client';

export interface GCPCredentialStatus {
  valid: boolean;
  needs_reconnect: boolean;
  message: string;
  project_id: string | null;
  status_code: string;
}

export function useGCPCredentialStatus() {
  const [credentialStatus, setCredentialStatus] = useState<GCPCredentialStatus | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  const checkCredentials = async () => {
    try {
      setIsChecking(true);
      const response = await apiCall('/gcp/credentials/status');
      
      
      if (response.ok) {
        const data = await response.json();
        setCredentialStatus(data);
      } else {
        // If endpoint fails, assume reconnection needed
        setCredentialStatus({
          valid: false,
          needs_reconnect: true,
          message: 'Could not verify GCP credentials. Please reconnect.',
          project_id: null,
          status_code: 'error'
        });
      }
    } catch (error) {
      console.error('[GCP Creds] Failed to check GCP credentials:', error);
      setCredentialStatus({
        valid: false,
        needs_reconnect: false,  // API error - treat as missing, not reconnect
        message: 'Could not verify GCP credentials. Please connect your GCP account.',
        project_id: null,
        status_code: 'missing'  // Treat API errors as missing credentials
      });
    } finally {
      setIsChecking(false);
    }
  };

  useEffect(() => {
    checkCredentials();
  }, []);

  return {
    credentialStatus,
    isChecking,
    recheckCredentials: checkCredentials,
  };
}
