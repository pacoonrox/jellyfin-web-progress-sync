import { beforeEach, describe, expect, it } from 'vitest';

import { getDeviceCredential } from './deviceCredential';

describe('deviceCredential', () => {
    beforeEach(() => {
        const values = new Map<string, string>();
        Object.defineProperty(window, 'localStorage', {
            configurable: true,
            value: {
                clear: () => values.clear(),
                getItem: (key: string) => values.get(key) ?? null,
                removeItem: (key: string) => values.delete(key),
                setItem: (key: string, value: string) => values.set(key, value)
            }
        });
    });

    it('creates a 256-bit installation credential and reuses it across routine launches', () => {
        const first = getDeviceCredential();
        const second = getDeviceCredential();

        expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(second).toBe(first);
    });

    it('requires a new identity after application data is cleared', () => {
        const first = getDeviceCredential();
        window.localStorage.clear();

        expect(getDeviceCredential()).not.toBe(first);
    });
});
