import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getSessionAuthentication, setSessionAuthentication } from 'utils/sessionAuthentication';

import ConnectionManager from './connectionManager';
import { ConnectionState } from './connectionState';

const server = { Id: 'server-1', ManualAddress: 'http://localhost:8096' };

function createManager() {
    let saved = { Servers: [{ ...server }] };
    return new ConnectionManager({
        credentials: (value) => {
            if (value) saved = value;
            return saved;
        },
        addOrUpdateServer: (servers, value) => {
            const index = servers.findIndex(item => item.Id === value.Id);
            if (index < 0) servers.push(value);
            else servers[index] = value;
        }
    }, 'test', '1.0', 'browser', 'device-1', {});
}

describe('revoked credentials during connection startup', () => {
    beforeEach(() => {
        window.localStorage.clear();
        window.sessionStorage.clear();
        setSessionAuthentication(server.Id, 'user-1', 'revoked-token');
    });

    afterEach(() => vi.unstubAllGlobals());

    it.each([401, 403])('does not restore a rejected token after a fresh connection (%s)', async (status) => {
        vi.stubGlobal('fetch', vi.fn(async (url) => {
            if (url.includes('System/Info/Public')) {
                return new Response(JSON.stringify({ Id: server.Id, Version: '99.0.0' }), { status: 200 });
            }
            return new Response(null, { status });
        }));

        const options = { reportCapabilities: false, enableWebSocket: false };
        const first = await createManager().connectToServer({ ...server }, options);

        expect(first.State).toBe(ConnectionState.ServerSignIn);
        expect(first.ApiClient.accessToken()).toBeFalsy();
        expect(first.ApiClient._sdk.accessToken).toBe('');
        expect(getSessionAuthentication(server.Id)).toBeNull();

        // A fresh manager represents a new page: it must not resurrect the token.
        const second = await createManager().connectToServer({ ...server }, options);
        expect(second.State).toBe(ConnectionState.ServerSignIn);
        expect(second.ApiClient.accessToken()).toBeFalsy();
        expect(fetch.mock.calls.filter(([url]) => url.includes('/Users/'))).toHaveLength(1);
    });
});
