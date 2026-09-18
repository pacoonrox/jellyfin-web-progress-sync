import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getSessionAuthentication, setSessionAuthentication } from 'utils/sessionAuthentication';

vi.mock('components/apphost', () => ({
    appHost: {
        appName: () => 'test',
        appVersion: () => '1.0',
        deviceName: () => 'browser',
        deviceId: () => 'device-1'
    }
}));
vi.mock('scripts/settings/appSettings', () => ({ default: { enableAutoLogin: () => true } }));
vi.mock('scripts/settings/userSettings', () => ({ setUserInfo: vi.fn().mockResolvedValue() }));
vi.mock('utils/bitrateTest', () => ({ detectBitrate: vi.fn() }));
vi.mock('utils/dashboard', () => ({ default: { capabilities: () => ({}) } }));

let client;
let reload;

describe('legacy request failure recovery', () => {
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
        const { default: connections } = await import('./ServerConnections');
        connections.initApiClient('http://localhost:8096');
        client = connections.currentApiClient();
        client.setAuthenticationInfo('revoked-token', 'user-1');
        client._sdk.update({ accessToken: 'revoked-token' });
        setSessionAuthentication(client.serverId(), 'user-1', 'revoked-token');
    });

    afterEach(() => {
        client._sdk.axiosInstance.interceptors.response.clear();
        vi.unstubAllGlobals();
    });

    it('clears credentials and reloads once when a legacy request receives 401', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 401 })));
        await expect(client.ajax({ type: 'GET', url: client.getUrl('System/Info') })).rejects.toMatchObject({ status: 401 });
        expect(reload).toHaveBeenCalledTimes(1);
        expect(getSessionAuthentication(client.serverId())).toBeNull();
        expect(client.accessToken()).toBeFalsy();
        expect(client._sdk.accessToken).toBe('');

        await expect(client.ajax({ type: 'GET', url: client.getUrl('System/Info') })).rejects.toMatchObject({ status: 401 });
        expect(reload).toHaveBeenCalledTimes(1);
    });

    it('preserves the session on permission denial', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 403 })));
        await expect(client.ajax({ type: 'GET', url: client.getUrl('System/Info') })).rejects.toMatchObject({ status: 403 });
        expect(reload).not.toHaveBeenCalled();
        expect(client.accessToken()).toBe('revoked-token');
    });
});
