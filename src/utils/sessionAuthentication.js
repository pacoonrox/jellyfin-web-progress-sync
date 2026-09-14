const SESSION_AUTH_KEY = 'jellyfin-progress-sync-session-auth';

export function getSessionAuthentication(serverId) {
    try {
        const value = JSON.parse(window.sessionStorage.getItem(SESSION_AUTH_KEY) || 'null');

        if (value?.ServerId === serverId && value.UserId && value.AccessToken) {
            return value;
        }
    } catch (error) {
        console.warn('[SessionAuthentication] unable to read session authentication', error);
    }

    return null;
}

export function setSessionAuthentication(serverId, userId, accessToken) {
    try {
        window.sessionStorage.setItem(SESSION_AUTH_KEY, JSON.stringify({
            ServerId: serverId,
            UserId: userId,
            AccessToken: accessToken
        }));
    } catch (error) {
        console.warn('[SessionAuthentication] unable to save session authentication', error);
    }
}

export function clearSessionAuthentication() {
    try {
        window.sessionStorage.removeItem(SESSION_AUTH_KEY);
    } catch (error) {
        console.warn('[SessionAuthentication] unable to clear session authentication', error);
    }
}
