import type { Api } from '@jellyfin/sdk';
import type { ApiClient } from 'jellyfin-apiclient';

import { clearSessionAuthentication } from 'utils/sessionAuthentication';

type SessionClient = ApiClient & { _sdk?: Api };

let handlingExpiredSession = false;

/** Remove every source from which this tab can restore a revoked session. */
export function clearExpiredSession(apiClient: SessionClient) {
    // Clear persistence before navigating: otherwise startup restores this token
    // and the next unauthorized request reloads the page all over again.
    clearSessionAuthentication();
    apiClient.setAuthenticationInfo();
    apiClient._sdk?.update({ accessToken: '' });
    apiClient.closeWebSocket();
}

/** SDK and legacy requests share one reload guard, including concurrent failures. */
export function handleExpiredSession(apiClient: SessionClient) {
    if (handlingExpiredSession || !apiClient.accessToken()) {
        return;
    }

    handlingExpiredSession = true;
    clearExpiredSession(apiClient);
    // Restart the router with no saved authentication so it can land on login.
    window.location.reload();
}
