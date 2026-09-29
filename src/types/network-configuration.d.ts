export {};

declare module '@jellyfin/sdk/lib/generated-client/models/network-configuration' {
    interface NetworkConfiguration {
        /** Restricts local (LAN) access to only the addresses/subnets listed in LocalIPFilter. Connections from the server itself are always allowed. */
        EnableLocalNetworkAccessControl?: boolean;
        /** Allowlist for local (LAN) IP connectivity, used only when EnableLocalNetworkAccessControl is enabled. */
        LocalIPFilter?: Array<string>;
    }
}
