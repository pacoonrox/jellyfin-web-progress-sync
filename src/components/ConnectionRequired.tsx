import React, { FunctionComponent, useCallback, useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import type { ApiClient, ConnectResponse } from 'jellyfin-apiclient';

import { ConnectionState, ServerConnections } from 'lib/jellyfin-apiclient';

import ConnectionErrorPage from './ConnectionErrorPage';
import Loading from './loading/LoadingComponent';

enum AccessLevel {
    /** Requires a user with administrator access */
    Admin = 'admin',
    /** No access restrictions */
    Public = 'public',
    /** Requires a valid user session */
    User = 'user',
    /** Requires the startup wizard to NOT be completed */
    Wizard = 'wizard'
};

type AccessLevelValue = `${AccessLevel}`;

enum BounceRoutes {
    Home = '/home',
    Login = '/login',
    SelectServer = '/selectserver',
    StartWizard = '/wizard/start'
}

type ConnectionRequiredProps = {
    level?: AccessLevelValue
};

const ERROR_STATES = [
    ConnectionState.ServerMismatch,
    ConnectionState.ServerUpdateNeeded,
    ConnectionState.Unavailable
];

const fetchPublicSystemInfo = async (apiClient: ApiClient) => {
    const infoResponse = await fetch(
        `${apiClient.serverAddress()}/System/Info/Public`,
        { cache: 'no-cache' }
    );

    if (!infoResponse.ok) {
        throw new Error('Public system info request failed');
    }

    return infoResponse.json();
};

/**
 * A component that ensures a server connection has been established.
 * Additional parameters exist to verify a user or admin have authenticated.
 * If a condition fails, this component will navigate to the appropriate page.
 */
const ConnectionRequired: FunctionComponent<ConnectionRequiredProps> = ({
    level = 'user'
}) => {
    const navigate = useNavigate();
    const location = useLocation();

    const [ errorState, setErrorState ] = useState<ConnectionState>();
    const [ isLoading, setIsLoading ] = useState(true);

    const navigateIfNotThere = useCallback((route: BounceRoutes) => {
        // If we try to navigate to the current route, just set isLoading = false
        if (location.pathname === route) setIsLoading(false);
        // Otherwise navigate to the route
        else navigate(route);
    }, [ location.pathname, navigate ]);

    const bounce = useCallback(async (connectionResponse: ConnectResponse) => {
        switch (connectionResponse.State) {
            case ConnectionState.SignedIn:
                // Already logged in, bounce to the home page
                console.debug('[ConnectionRequired] already logged in, redirecting to home');
                navigate(BounceRoutes.Home);
                return;
            case ConnectionState.ServerSignIn:
                // Bounce to the login page
                if (location.pathname === BounceRoutes.Login) {
                    setIsLoading(false);
                } else {
                    console.debug('[ConnectionRequired] not logged in, redirecting to login page', location);
                    const url = encodeURIComponent(location.pathname + location.search);
                    navigate(`${BounceRoutes.Login}?serverid=${connectionResponse.ApiClient.serverId()}&url=${url}`);
                }
                return;
            case ConnectionState.ServerSelection:
                // Bounce to select server page
                console.debug('[ConnectionRequired] redirecting to select server page');
                navigateIfNotThere(BounceRoutes.SelectServer);
                return;
        }

        console.warn('[ConnectionRequired] unhandled connection state', connectionResponse.State);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ navigateIfNotThere, location.pathname, navigate ]);

    const handleWizard = useCallback(async (firstConnection: ConnectResponse | null) => {
        const apiClient = firstConnection?.ApiClient || ServerConnections.currentApiClient();
        if (!apiClient) {
            throw new Error('No ApiClient available');
        }

        try {
            const systemInfo = await fetchPublicSystemInfo(apiClient);
            if (systemInfo?.StartupWizardCompleted) {
                console.info('[ConnectionRequired] startup wizard is complete, redirecting home');
                navigate(BounceRoutes.Home);
                return;
            }
        } catch (ex) {
            // Could not verify wizard completion (e.g. a transient network error).
            // Fall through and show the wizard instead of leaving the user stuck
            // on the loading spinner - it's already the route they were headed to.
            console.error('[ConnectionRequired] checking wizard status failed', ex);
        }

        // Update the current ApiClient
        ServerConnections.setLocalApiClient(apiClient);
        setIsLoading(false);
    }, [ navigate ]);

    const handleIncompleteWizard = useCallback(async (firstConnection: ConnectResponse) => {
        if (firstConnection.State === ConnectionState.ServerSignIn) {
            // Verify the wizard is complete
            try {
                const systemInfo = await fetchPublicSystemInfo(firstConnection.ApiClient);
                if (!systemInfo?.StartupWizardCompleted) {
                    // Update the current ApiClient
                    // TODO: Is there a better place to handle this?
                    ServerConnections.setLocalApiClient(firstConnection.ApiClient);
                    // Bounce to the wizard
                    console.info('[ConnectionRequired] startup wizard is not complete, redirecting there');
                    navigate(BounceRoutes.StartWizard);
                    return;
                }
            } catch (ex) {
                // Could not verify wizard status (e.g. a transient network error).
                // Fall through to the normal login flow rather than leaving the
                // user stuck on the loading spinner forever.
                console.error('[ConnectionRequired] checking wizard status failed', ex);
            }
        }

        // Bounce to the correct page in the login flow
        bounce(firstConnection)
            .catch(err => {
                console.error('[ConnectionRequired] failed to bounce', err);
            });
    }, [bounce, navigate]);

    // Reconnects and bounces to whatever page that resolves to (login, home,
    // select server, etc). Used to recover when a request that gates access
    // (auth check, admin check) fails - e.g. a token was revoked mid-session.
    // Only shows the generic connection-error page if reconnecting itself
    // fails, so the user is never left stuck on the loading spinner.
    const bounceOrShowError = useCallback(async () => {
        try {
            await bounce(await ServerConnections.connect());
        } catch (ex) {
            console.error('[ConnectionRequired] failed to reconnect', ex);
            setErrorState(ConnectionState.Unavailable);
        }
    }, [bounce]);

    const validateUserAccess = useCallback(async () => {
        const client = ServerConnections.currentApiClient();

        // If this is a user route, ensure a user is logged in
        if ((level === AccessLevel.Admin || level === AccessLevel.User) && !client?.isLoggedIn()) {
            console.warn('[ConnectionRequired] unauthenticated user attempted to access user route');
            await bounceOrShowError();
            return;
        }

        // If this is an admin route, ensure the user has access
        if (level === AccessLevel.Admin) {
            try {
                const user = await client?.getCurrentUser();
                if (!user?.Policy?.IsAdministrator) {
                    console.warn('[ConnectionRequired] normal user attempted to access admin route');
                    await bounceOrShowError();
                    return;
                }
            } catch (ex) {
                // This can happen if the session was revoked (e.g. idle
                // logout) while the page was open. Try to reconnect rather
                // than leaving the user stuck on the loading spinner.
                console.warn('[ConnectionRequired] error checking admin access, attempting to reconnect', ex);
                await bounceOrShowError();
                return;
            }
        }

        setIsLoading(false);
    }, [bounceOrShowError, level]);

    useEffect(() => {
        // Check connection status on initial page load
        const apiClient = ServerConnections.currentApiClient();
        const connection = Promise.resolve(ServerConnections.firstConnection ? null : ServerConnections.connect());
        connection.then(firstConnection => {
            console.debug('[ConnectionRequired] connection state', firstConnection?.State);
            ServerConnections.firstConnection = true;

            if (firstConnection && ERROR_STATES.includes(firstConnection.State)) {
                setErrorState(firstConnection.State);
            } else if (level === AccessLevel.Wizard) {
                handleWizard(firstConnection)
                    .catch(err => {
                        console.error('[ConnectionRequired] could not validate wizard status', err);
                    });
            } else if (
                firstConnection && firstConnection.State !== ConnectionState.SignedIn && !apiClient?.isLoggedIn()
            ) {
                handleIncompleteWizard(firstConnection)
                    .catch(err => {
                        console.error('[ConnectionRequired] could not start wizard', err);
                    });
            } else {
                validateUserAccess()
                    .catch(err => {
                        console.error('[ConnectionRequired] could not validate user access', err);
                    });
            }
        }).catch(err => {
            // The initial connection attempt itself failed (not just a bad
            // ConnectionState). Show the error page instead of leaving the
            // user stuck on the loading spinner indefinitely.
            console.error('[ConnectionRequired] failed to connect', err);
            setErrorState(ConnectionState.Unavailable);
        });
    }, [handleIncompleteWizard, handleWizard, level, validateUserAccess]);

    if (errorState) {
        return <ConnectionErrorPage state={errorState} />;
    }

    if (isLoading) {
        return <Loading />;
    }

    return <Outlet />;
};

export default ConnectionRequired;
