import { ServerConnections } from 'lib/jellyfin-apiclient';
import layoutManager from 'components/layoutManager';

import { getRequestHref } from './requestUrl';

interface SeerrSsoRedirectOptions {
    embedded?: boolean;
}

function closeRequestOverlay() {
    const overlay = document.querySelector('.requestOverlay');

    if (overlay) {
        overlay.remove();
    }

    document.body.classList.remove('bodyWithPopupOpen');
}

function openRequestOverlay(url?: string) {
    closeRequestOverlay();

    const overlay = document.createElement('div');
    overlay.className = 'requestOverlay';

    const header = document.createElement('div');
    header.className = 'requestOverlayHeader';

    const closeButton = document.createElement('button');
    closeButton.className = 'requestOverlayClose';
    closeButton.type = 'button';
    closeButton.title = 'Back';
    closeButton.innerHTML = '<span class="material-icons" aria-hidden="true">close</span>';
    closeButton.addEventListener('click', closeRequestOverlay);

    const frame = document.createElement('iframe');
    frame.className = 'requestOverlayFrame';
    frame.title = 'Request media';
    frame.src = url || 'about:blank';

    header.appendChild(closeButton);
    overlay.appendChild(header);
    overlay.appendChild(frame);
    document.body.appendChild(overlay);
    document.body.classList.add('bodyWithPopupOpen');

    return frame;
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
            embedded: options.embedded
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
        const requestFrame = openRequestOverlay();

        try {
            requestFrame.src = await getSeerrSsoRedirectUrl(requestUrl, { embedded: true });
        } catch (err) {
            console.warn('Unable to use Jellyfin SSO for request link', err);
            requestFrame.src = requestUrl;
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
