export {};

declare module '@jellyfin/sdk/lib/generated-client/models/user-policy' {
    interface UserPolicy {
        TwoFactorAuthenticationPolicy?: 'Disabled' | 'Allowed' | 'Required';
        /** Effective idle-logout minutes for this user's own client-side inactivity watcher; 0 when idle logout is disabled for this user. Configure idle logout from the Trusted Devices admin page, not this field. */
        InactiveLogoutMinutes?: number;
    }
}
