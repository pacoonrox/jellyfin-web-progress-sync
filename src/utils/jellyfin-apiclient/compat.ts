import { Api, Jellyfin } from '@jellyfin/sdk';
import { ApiClient } from 'jellyfin-apiclient';

import { safeDecodeURIComponent } from 'utils/url';
import { handleExpiredSession } from './expiredSession';

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
            // Only treat it as an expired session if the client believed it
            // had a token in the first place (excludes pre-auth calls).
            if (error?.response?.status === 401 && apiClient.accessToken()) {
                handleExpiredSession(apiClient);
            }

            return Promise.reject(error);
        }
    );

    return api;
};
