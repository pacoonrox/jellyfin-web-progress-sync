import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getSessionAuthentication, setSessionAuthentication } from 'utils/sessionAuthentication';

const storageKey = 'jellyfin-progress-sync-session-auth';
let client;
let api;
let reload;
let expire;

async function failRequest(status) {
    await expect(api.axiosInstance.get('/Users/Me', {
        adapter: config => Promise.reject(Object.assign(new Error('Request rejected'), { config, response: { status } }))
    })).rejects.toMatchObject({ response: { status } });
}

describe('session expiry recovery', () => {
    beforeEach(async () => {
        vi.resetModules();
        window.localStorage.clear();
        window.sessionStorage.clear();
        reload = vi.fn();
        vi.stubGlobal('window', {
            localStorage: window.localStorage,
            sessionStorage: window.sessionStorage,
            location: { reload }
        });

        let token = 'revoked-token';
        client = {
            accessToken: () => token,
            setAuthenticationInfo: vi.fn(value => { token = value; }),
            closeWebSocket: vi.fn(),
            serverAddress: () => 'http://localhost:8096',
            appName: () => 'test',
            appVersion: () => '1.0',
            deviceName: () => 'browser',
            deviceId: () => 'device-1'
        };
        const { toApi } = await import('./compat');
        const { handleExpiredSession } = await import('./expiredSession');
        expire = handleExpiredSession;
        api = toApi(client);
        client._sdk = api;

        setSessionAuthentication('server-1', 'user-1', token);
        window.sessionStorage.setItem(storageKey, window.localStorage.getItem(storageKey));
    });

    afterEach(() => {
        api.axiosInstance.interceptors.response.clear();
        vi.unstubAllGlobals();
    });

    it('clears saved and live credentials before the SDK reloads, preventing restoration on restart', async () => {
        reload.mockImplementation(() => {
            expect(getSessionAuthentication('server-1')).toBeNull();
            expect(window.sessionStorage.getItem(storageKey)).toBeNull();
            expect(client.accessToken()).toBeFalsy();
            expect(api.accessToken).toBe('');
        });
        await failRequest(401);
        expect(reload).toHaveBeenCalledTimes(1);
        expect(client.closeWebSocket).toHaveBeenCalledTimes(1);

        // Simulate the next document loading. No token can be restored, so even
        // a rejected pre-login request cannot reload the login page again.
        vi.resetModules();
        const nextPage = await import('./expiredSession');
        nextPage.handleExpiredSession(client);
        expect(reload).toHaveBeenCalledTimes(1);
    });

    it('shares the reload guard between concurrent legacy and SDK failures', async () => {
        expire(client);
        await failRequest(401);
        expire(client);
        expect(reload).toHaveBeenCalledTimes(1);
        expect(getSessionAuthentication('server-1')).toBeNull();
        expect(api.accessToken).toBe('');
    });

    it.each([403, 500])('does not log out for an ordinary HTTP %s error', async (status) => {
        await failRequest(status);
        expect(reload).not.toHaveBeenCalled();
        expect(client.accessToken()).toBe('revoked-token');
        expect(getSessionAuthentication('server-1')).not.toBeNull();
    });

    it('does not reload for an unauthenticated request or failed login', async () => {
        client.setAuthenticationInfo();
        await failRequest(401);
        expect(reload).not.toHaveBeenCalled();
    });

    it('still clears session storage when clearing local storage throws', () => {
        vi.stubGlobal('window', {
            localStorage: { removeItem: () => { throw new Error('Storage unavailable'); } },
            sessionStorage: window.sessionStorage,
            location: { reload }
        });
        expire(client);
        expect(window.sessionStorage.getItem(storageKey)).toBeNull();
        expect(reload).toHaveBeenCalledTimes(1);
    });
});
