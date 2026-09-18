import { ServerConnections } from 'lib/jellyfin-apiclient';
import Events from 'utils/events';

const CHECK_INTERVAL_MS = 15000;

let timer;
let enabled = false;

function checkSession() {
    const apiClient = ServerConnections.currentApiClient();
    if (!apiClient?.accessToken()) {
        return;
    }

    // A lightweight, always-fresh ping - unlike apiClient.getCurrentUser(), this is
    // never cached, so it actually hits the network every time. A 401 here is caught
    // by ServerConnections' global 'requestfail' handler, which clears the dead
    // credentials and reloads. Without a dedicated, short-interval check like this,
    // a session revoked while the app stays open (idle logout, an administrator's
    // "Log out device", etc) is only discovered whenever some unrelated request
    // next happens to run, which can take a long time with nothing actively polling.
    apiClient.ajax({
        type: 'GET',
        url: apiClient.getUrl('System/Info'),
        dataType: 'json'
    }).catch(() => {
        // Failures are handled globally via the 'requestfail' event.
    });
}

function start() {
    stop();
    timer = setInterval(checkSession, CHECK_INTERVAL_MS);
}

function stop() {
    if (timer) {
        clearInterval(timer);
        timer = null;
    }
}

export function initializeSessionLivenessCheck() {
    if (enabled) {
        return;
    }

    enabled = true;
    Events.on(ServerConnections, 'localusersignedin', start);
    Events.on(ServerConnections, 'localusersignedout', stop);
}
