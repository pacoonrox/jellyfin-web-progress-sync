import { Api, Jellyfin } from '@jellyfin/sdk';
import { ApiClient } from 'jellyfin-apiclient';

import { safeDecodeURIComponent } from 'utils/url';

/**
 * The Api instance is created once and reused for the lifetime of the tab
 * (see ServerConnections.getApi's apiClient._sdk ??= toApi(apiClient)), so
 * nothing re-checks its validity while the app stays open. If the session is
 * revoked in the meantime (idle logout, an administrator's device logout,
 * etc), every subsequent call through it just fails with 401 forever - most
 * visibly as an endless failed websocket reconnect loop - with no prompt to
 * sign back in. Reloading re-runs the (already-corrected) boot-time
 * validation in connectionManager.js's onSuccessfulConnection, which clears
 * the dead credentials and bounces to the login page.
 */
let handlingExpiredSession = false;

function handleExpiredSession(apiClient: ApiClient) {
    if (handlingExpiredSession) {
        return;
    }

    handlingExpiredSession = true;
    apiClient.setAuthenticationInfo();
    window.location.reload();
}

/**
 * Returns an SDK Api instance using the same parameters as the provided ApiClient.
 * @param {ApiClient} apiClient The (legacy) ApiClient.
 * @returns {Api} An equivalent SDK Api instance.
 */
export const toApi = (apiClient: ApiClient): Api => {
    const api = (new Jellyfin({
        // The SDK encodes these values when creating the authorization header,
        // so we need to decode them here to avoid double encoding.
        clientInfo: {
            name: safeDecodeURIComponent(apiClient.appName()),
            version: safeDecodeURIComponent(apiClient.appVersion())
        },
        deviceInfo: {
            name: safeDecodeURIComponent(apiClient.deviceName()),
            id: safeDecodeURIComponent(apiClient.deviceId())
        }
    })).createApi(
        apiClient.serverAddress(),
        apiClient.accessToken()
    );

    api.axiosInstance.interceptors.response.use(
        response => response,
        error => {
            // 401 means the token itself is no longer valid; 403 can mean a
            // perfectly valid session just lacks permission for one endpoint
            // (e.g. a non-admin call), which must not force a global logout.
            if (error?.response?.status === 401) {
                handleExpiredSession(apiClient);
            }

            return Promise.reject(error);
        }
    );

    return api;
};
