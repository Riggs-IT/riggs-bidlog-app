// Reconnect through the already-configured Microsoft authorization flow.
// No delegated token or session ID is exposed to JavaScript.
let inFlight = null;
let pendingRevision = null;

async function revision() {
  const response = await window.fetch('/api/auth/delegated/reconnect-status', {
    credentials: 'same-origin', cache: 'no-store',
  });
  if (!response.ok) throw new Error('Your Bid Log session is no longer available. Sign in again.');
  const data = await response.json();
  if (typeof data?.revision !== 'string') throw new Error('Microsoft connection status unavailable.');
  return data.revision;
}

export function reconnectMicrosoft() {
  if (inFlight) return inFlight;

  // Open synchronously from the click to avoid popup blocking.
  const popup = window.open('', 'riggs-microsoft-reconnect',
    'popup=yes,width=520,height=680');
  if (!popup) {
    return Promise.reject(new Error('Allow pop-ups for Bid Log, then try Reconnect Microsoft. Your edits are still here.'));
  }

  inFlight = (async () => {
    let previous;
    try {
      previous = await revision();
    } catch (error) {
      popup.close();
      throw error;
    }
    pendingRevision = previous;
    popup.location.assign('/api/auth/delegated/reconnect');

    const wasClosed = await new Promise(resolve => {
      const interval = window.setInterval(() => {
        if (popup.closed) {
          window.clearInterval(interval);
          window.clearTimeout(timeout);
          resolve(true);
        }
      }, 500);
      const timeout = window.setTimeout(() => {
        window.clearInterval(interval);
        resolve(false);
      }, 180000);
    });

    if (!wasClosed) {
      throw new Error('Finish Microsoft sign-in in the other window, close it, then reconnect again.');
    }
    const current = await revision();
    if (!current || current === previous) {
      throw new Error('Microsoft access was not renewed. Reconnect again; your edits have been preserved.');
    }
    pendingRevision = null;
    // Deliberately no submission or automatic retry.
    return true;
  })().finally(() => { inFlight = null; });
  return inFlight;
}

// Optional manual verification: Microsoft identity providers can separate
// window handles during cross-site redirects. A user can always return to
// the original editor and check completion without repeating OAuth or Save.
export async function checkMicrosoftReconnect() {
  if (pendingRevision === null) {
    throw new Error('Select Reconnect Microsoft before checking the connection.');
  }
  const current = await revision();
  if (!current || current === pendingRevision) {
    throw new Error('Microsoft access is not connected yet. Finish signing in, then check again.');
  }
  pendingRevision = null;
  return true;
}
