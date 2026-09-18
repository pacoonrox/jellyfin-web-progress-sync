import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConnectionState, ServerConnections } from 'lib/jellyfin-apiclient';

import ConnectionRequired from './ConnectionRequired';

vi.mock('lib/jellyfin-apiclient', async () => ({
    ...await import('lib/jellyfin-apiclient/connectionState'),
    ServerConnections: {
        firstConnection: false,
        connect: vi.fn(),
        currentApiClient: vi.fn()
    }
}));
vi.mock('./ConnectionErrorPage', () => ({ default: () => <div>Connection error</div> }));
vi.mock('./loading/LoadingComponent', () => ({ default: () => <div>Loading</div> }));

describe('login landing after session expiry', () => {
    let root;
    let container;

    afterEach(async () => {
        if (root) await act(async () => root.unmount());
        container?.remove();
        vi.unstubAllGlobals();
    });

    it('leaves the protected route and renders login after cleared credentials reconnect', async () => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        const client = {
            isLoggedIn: () => false,
            serverId: () => 'server-1',
            serverAddress: () => 'http://localhost:8096'
        };
        ServerConnections.firstConnection = false;
        ServerConnections.currentApiClient.mockReturnValue(client);
        ServerConnections.connect.mockResolvedValue({ State: ConnectionState.ServerSignIn, ApiClient: client });
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ StartupWizardCompleted: true }))));

        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
        await act(async () => {
            root.render(
                <MemoryRouter initialEntries={['/home']}>
                    <Routes>
                        <Route element={<ConnectionRequired />}>
                            <Route path='/home' element={<div>Home</div>} />
                        </Route>
                        <Route element={<ConnectionRequired level='public' />}>
                            <Route path='/login' element={<div>Sign in</div>} />
                        </Route>
                    </Routes>
                </MemoryRouter>
            );
        });
        expect(container.textContent).toBe('Sign in');
        expect(ServerConnections.connect).toHaveBeenCalledTimes(1);
    });
});
