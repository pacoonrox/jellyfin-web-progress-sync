import { playbackManager } from 'components/playback/playbackmanager';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import Dashboard from 'utils/dashboard';
import Events from 'utils/events';

const CHECK_INTERVAL_MS = 15000;
const ACTIVITY_EVENTS = [
    'keydown',
    'mousedown',
    'mousemove',
    'pointerdown',
    'scroll',
    'touchstart',
    'wheel'
];

let timeoutMinutes = 0;
let lastActivity = Date.now();
let timer;
let enabled = false;
let logoutInProgress = false;

function isActivePlayback() {
    return !!playbackManager.isPlaying() && !playbackManager.paused();
}

function markActive() {
    lastActivity = Date.now();
}

function stopTimer() {
    if (timer) {
        clearInterval(timer);
        timer = null;
    }
}

function reset() {
    timeoutMinutes = 0;
    logoutInProgress = false;
    markActive();
    stopTimer();
}

async function reportInactive() {
    const result = await window.ApiClient.ajax({
        type: 'POST',
        url: window.ApiClient.getUrl('Sessions/Logout/Inactive'),
        dataType: 'json',
        headers: { accept: 'application/json' }
    });
    return result?.json ? result.json() : result;
}

function checkInactive() {
    if (!timeoutMinutes) {
        return;
    }

    if (isActivePlayback()) {
        markActive();
        return;
    }

    const inactiveMs = Date.now() - lastActivity;
    if (inactiveMs >= timeoutMinutes * 60000) {
        if (logoutInProgress) {
            return;
        }

        logoutInProgress = true;
        reportInactive().then(loggedOutCurrentDevice => {
            if (loggedOutCurrentDevice === true) {
                reset();
                Dashboard.logout({ clearSavedServer: true });
            } else {
                markActive();
                logoutInProgress = false;
            }
        }).catch(error => {
            console.warn('[inactivityLogout] failed to apply inactivity policy', error);
            // The server could not confirm whether this device is still exempt, so fail closed.
            reset();
            Dashboard.logout({ clearSavedServer: true });
        });
    }
}

function start(user) {
    const minutes = Number(user?.Policy?.InactiveLogoutMinutes) || 0;

    reset();
    timeoutMinutes = Math.max(0, minutes);

    if (timeoutMinutes > 0) {
        timer = setInterval(checkInactive, CHECK_INTERVAL_MS);
    }
}

export function initializeInactivityLogout() {
    if (enabled) {
        return;
    }

    enabled = true;
    ACTIVITY_EVENTS.forEach(eventName => {
        document.addEventListener(eventName, markActive, { passive: true });
    });

    Events.on(ServerConnections, 'localusersignedin', (_e, user) => {
        start(user);
    });

    Events.on(ServerConnections, 'localusersignedout', reset);
    Events.on(playbackManager, 'playbackstart', markActive);
    Events.on(playbackManager, 'playbackstop', markActive);
    Events.on(playbackManager, 'playerchange', markActive);
}
