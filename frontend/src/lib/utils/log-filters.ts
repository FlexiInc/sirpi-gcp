/**
 * Filter out technical/debugging messages that users don't need to see
 */

export function shouldShowLogToUser(message: string): boolean {
  // Always show commands (start with $)
  if (message.trim().startsWith('$')) {
    return true;
  }
  
  // Always show success/completion messages
  if (message.includes('✅') || message.includes('successfully') || message.includes('complete')) {
    return true;
  }
  
  // Messages to hide from users (technical implementation details)
  const hiddenPatterns = [
    'Fixing Docker socket permissions',
    'Docker daemon already running, fixing socket permissions',
    'permission denied while trying to connect',
    'Command execution failed',
    'Service account not available, using OAuth',
    'expires in 1 hour',
  ];
  
  // Hide if matches any hidden pattern
  if (hiddenPatterns.some(pattern => message.includes(pattern))) {
    return false;
  }
  
  // Hide only "Preparing" and "Waiting" Docker layer messages
  if (message.match(/^[a-f0-9]+: (Preparing|Waiting)$/)) {
    return false;
  }
  
  // Show everything else (including "Pushed", "Layer already exists", summary messages)
  return true;
}

/**
 * Clean up log message for better readability
 */
export function cleanLogMessage(message: string): string {
  // Remove timestamp prefix if present
  const withoutTimestamp = message.replace(/^\[\d{1,2}:\d{2}:\d{2} [AP]M\] /, '');
  
  return withoutTimestamp;
}
