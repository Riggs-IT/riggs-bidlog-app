/**
 * Honor terminal-usage feedback only for the exact session UUID submitted.
 * Older bridge responses omit sessionEnded and must remain compatible.
 * This is tracking data, never an authentication or authorization decision.
 */
export function isTerminalUsageHeartbeat(response, submittedId, currentId) {
  return (
    response?.sessionEnded === true
    && typeof response.usageSessionId === 'string'
    && typeof submittedId === 'string'
    && submittedId.length > 0
    && currentId === submittedId
    && response.usageSessionId.toLowerCase() === submittedId.toLowerCase()
  );
}
