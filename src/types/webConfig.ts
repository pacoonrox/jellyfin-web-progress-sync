export interface Theme {
    name: string
    default?: boolean;
    id: string
    color: string
}

export interface MenuLink {
    name: string
    icon?: string
    url: string
}

export interface CustomLinks {
    radarrUrl?: string
    sonarrUrl?: string
}

export interface WebConfig {
    includeCorsCredentials?: boolean
    multiserver?: boolean
    customLinks?: CustomLinks
    themes?: Theme[]
    menuLinks?: MenuLink[]
    servers?: string[]
    plugins?: string[]
}
