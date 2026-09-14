import '@jellyfin/sdk/lib/generated-client/models/user-policy';

declare module '@jellyfin/sdk/lib/generated-client/models/user-policy' {
    interface UserPolicy {
        TwoFactorAuthenticationPolicy?: 'Disabled' | 'Allowed' | 'Required';
        InactiveLogoutMinutes?: number;
    }
}
