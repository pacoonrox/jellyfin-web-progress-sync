/* eslint-disable compat/compat -- Quick Sign-On is offered only where Web Crypto can create a secure credential. */
const STORAGE_KEY = 'jellyfin-device-approval-credential-v1';

/**
 * Returns an installation secret that is independent of mutable device telemetry.
 * Browser builds use origin-scoped app storage; native wrappers should replace this
 * adapter with Keychain/Keystore-backed storage while preserving the value on update.
 */
export function getDeviceCredential(): string {
    const current = window.localStorage.getItem(STORAGE_KEY);
    if (current) return current;

    if (!window.crypto || !window.crypto.getRandomValues) {
        throw new Error('This client cannot create a secure installation credential');
    }

    const bytes = new Uint8Array(32);
    window.crypto.getRandomValues(bytes);
    const credential = btoa(String.fromCharCode(...bytes))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
    window.localStorage.setItem(STORAGE_KEY, credential);
    return credential;
}

/* eslint-enable compat/compat */
