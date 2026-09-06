export function getRequestHref() {
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    const port = window.location.port ? `:${window.location.port}` : '';
    const labels = hostname.split('.');
    const isIpAddress = /^[\d.]+$/.test(hostname) || hostname.includes(':');

    if (hostname === 'localhost' || isIpAddress || labels.length < 2) {
        return `${protocol}//${hostname}${port}`;
    }

    return `${protocol}//request.${labels.slice(-2).join('.')}`;
}
