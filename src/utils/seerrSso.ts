import { ServerConnections } from 'lib/jellyfin-apiclient';
import layoutManager from 'components/layoutManager';

import { getRequestHref } from './requestUrl';

interface SeerrSsoRedirectOptions {
    embedded?: boolean;
    jellyfinReturnUrl?: string;
}

export async function getSeerrSsoRedirectUrl(
    requestUrl = getRequestHref(),
    options: SeerrSsoRedirectOptions = {}
) {
    const apiClient = ServerConnections.currentApiClient();
    const jellyfinToken = apiClient?.accessToken?.();

    if (!jellyfinToken) {
        return requestUrl;
    }

    const ssoUrl = new URL('/api/v1/auth/jellyfin-sso/start', requestUrl);
    const response = await fetch(ssoUrl.href, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            jellyfinToken,
            returnTo: '/',
            embedded: options.embedded,
            jellyfinReturnUrl: options.jellyfinReturnUrl
        })
    });

    if (!response.ok) {
        throw new Error('Jellyfin SSO failed');
    }

    const result = await response.json();
    return new URL(result.redirectUrl, requestUrl).href;
}

export async function openSeerrRequest(requestUrl = getRequestHref()) {
    if (layoutManager.mobile) {
        try {
            window.location.href = await getSeerrSsoRedirectUrl(requestUrl, {
                jellyfinReturnUrl: window.location.href
            });
        } catch (err) {
            console.warn('Unable to use Jellyfin SSO for request link', err);
            window.location.href = requestUrl;
        }

        return;
    }

    const requestWindow = window.open('about:blank', '_blank');

    if (requestWindow) {
        requestWindow.opener = null;
    }

    try {
        const redirectUrl = await getSeerrSsoRedirectUrl(requestUrl);

        if (requestWindow) {
            requestWindow.location.href = redirectUrl;
        } else {
            window.location.href = redirectUrl;
        }
    } catch (err) {
        console.warn('Unable to use Jellyfin SSO for request link', err);

        if (requestWindow) {
            requestWindow.location.href = requestUrl;
        } else {
            window.location.href = requestUrl;
        }
    }
}
