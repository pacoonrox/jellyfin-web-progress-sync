import DefaultConfig from '../config.json';
import { getCustomLinks } from '../scripts/settings/webSettings';

interface CustomLinks {
    localSeerrUrl?: string;
    requestSubdomain?: string;
}

function isPrivateHostname(hostname: string) {
    const lowerHostname = hostname.toLowerCase();

    if (lowerHostname === 'localhost' || lowerHostname.endsWith('.local')) {
        return true;
    }

    const ipv4Match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
    if (ipv4Match) {
        const octets = ipv4Match.slice(1).map(Number);
        if (octets.some(octet => octet < 0 || octet > 255)) {
            return false;
        }

        return octets[0] === 10
            || octets[0] === 127
            || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
            || (octets[0] === 192 && octets[1] === 168)
            || (octets[0] === 169 && octets[1] === 254);
    }

    return lowerHostname.includes(':') && (
        lowerHostname === '::1'
        || lowerHostname.startsWith('fc')
        || lowerHostname.startsWith('fd')
        || lowerHostname.startsWith('fe80:')
    );
}

function normalizeBaseUrl(url: string) {
    while (url.endsWith('/')) {
        url = url.slice(0, -1);
    }

    return url;
}

export function getRequestHref(customLinks: CustomLinks = DefaultConfig.customLinks || {}) {
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    const labels = hostname.split('.');

    if (isPrivateHostname(hostname)) {
        if (customLinks.localSeerrUrl) {
            return normalizeBaseUrl(customLinks.localSeerrUrl);
        }

        return `${protocol}//${hostname}:5055`;
    }

    if (labels.length < 2) {
        return `${protocol}//${hostname}:5055`;
    }

    const requestSubdomain = customLinks.requestSubdomain || 'request';
    return `${protocol}//${requestSubdomain}.${labels.slice(-2).join('.')}`;
}

export async function getConfiguredRequestHref() {
    return getRequestHref(await getCustomLinks());
}
