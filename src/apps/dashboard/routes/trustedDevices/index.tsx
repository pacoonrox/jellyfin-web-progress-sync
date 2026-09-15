/* eslint-disable react/jsx-no-bind, no-void */
import React, { FC, FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

import Page from 'components/Page';
import Button from 'elements/emby-button/Button';
import { useApi } from 'hooks/useApi';

import './trustedDevices.scss';

interface TrustedDevice {
    Id: number;
    UserId: string;
    Username: string;
    FriendlyName: string;
    AppName: string;
    AppVersion: string;
    Platform: string;
    OsVersion: string;
    LastIpAddress: string;
    Source: string;
    State: string;
    RequiresFreshTwoFactor: boolean;
    FirstSeenUtc: string;
    LastSeenUtc: string;
    IssuedUtc?: string;
    ExpiresUtc?: string;
}

interface SecurityAudit {
    Id: number;
    TimestampUtc: string;
    Event: string;
    Source: string;
    Result: string;
    ActingUserId?: string;
    TargetUserId?: string;
    AdministratorInvolved: boolean;
    Detail: string;
}

const TrustedDevicesPage: FC = () => {
    const { __legacyApiClient__: api } = useApi();
    const [ devices, setDevices ] = useState<TrustedDevice[]>([]);
    const [ enabled, setEnabled ] = useState(true);
    const [ defaultDays, setDefaultDays ] = useState(30);
    const [ search, setSearch ] = useState('');
    const [ state, setState ] = useState('');
    const [ message, setMessage ] = useState('');
    const [ audit, setAudit ] = useState<SecurityAudit[]>([]);

    const load = useCallback(async () => {
        if (!api) return;
        const [ policy, records, auditRecords ] = await Promise.all([
            api.getJSON(api.getUrl('/DeviceApproval/Admin/Policy')),
            api.getJSON(api.getUrl(`/DeviceApproval/Admin/TrustedDevices?search=${encodeURIComponent(search)}&state=${encodeURIComponent(state)}`)),
            api.getJSON(api.getUrl('/DeviceApproval/Admin/Audit?limit=200'))
        ]);
        setEnabled(policy.Enabled);
        setDefaultDays(policy.DefaultTrustDays);
        setDevices(records.Items);
        setAudit(auditRecords);
    }, [ api, search, state ]);

    useEffect(() => {
        void load();
    }, [ load ]);

    const grouped = useMemo(() => Object.entries(devices.reduce<Record<string, TrustedDevice[]>>((groups, device) => {
        const key = `${device.Username}\u0000${device.UserId}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(device);
        return groups;
    }, {})), [ devices ]);

    const savePolicy = useCallback(async (event: FormEvent) => {
        event.preventDefault();
        if (!api) return;
        await api.ajax({ type: 'PUT', url: api.getUrl('/DeviceApproval/Admin/Policy'), data: JSON.stringify({ Enabled: enabled, DefaultTrustDays: defaultDays }), contentType: 'application/json' });
        setMessage('Trusted-device policy saved. Disabling the policy immediately revokes existing trust.');
        void load();
    }, [ api, defaultDays, enabled, load ]);

    const update = useCallback(async (device: TrustedDevice, trust = false) => {
        if (!api) return;
        const name = window.prompt('Administrative device name', device.FriendlyName);
        if (name === null) return;
        const current = device.ExpiresUtc ? device.ExpiresUtc.slice(0, 10) : new Date(Date.now() + defaultDays * 86400000).toISOString().slice(0, 10);
        const expiration = window.prompt('Trust expiration (YYYY-MM-DD)', current);
        if (!expiration) return;
        await api.ajax({ type: trust ? 'POST' : 'PUT', url: api.getUrl(`/DeviceApproval/Admin/TrustedDevices/${device.Id}${trust ? '/Trust' : ''}`), data: JSON.stringify({ FriendlyName: name, ExpiresUtc: new Date(`${expiration}T23:59:59Z`).toISOString() }), contentType: 'application/json' });
        void load();
    }, [ api, defaultDays, load ]);

    const remove = useCallback(async (path: string, prompt: string) => {
        if (!api || !window.confirm(prompt)) return;
        await api.ajax({ type: 'DELETE', url: api.getUrl(path) });
        void load();
    }, [ api, load ]);

    return (
        <Page id='trustedDevicesPage' title='Trusted devices' className='mainAnimatedPage type-interior'>
            <div className='content-primary trustedDevicesPage'>
                <h2>Trusted-device policy</h2>
                <p>Trust bypasses only a user’s 2FA challenge after password verification. It does not change logout, session expiry, account state, or permissions.</p>
                <form onSubmit={event => void savePolicy(event)} className='trustedDevicePolicy'>
                    <label><input type='checkbox' checked={enabled} onChange={event => setEnabled(event.currentTarget.checked)} /> Enable device approval and trusted devices</label>
                    <label>Default duration (days)<input type='number' min='1' max='3650' value={defaultDays} onChange={event => setDefaultDays(Number(event.currentTarget.value))} /></label>
                    <Button type='submit' className='raised button-submit' title='Save policy' />
                </form>
                {message && <p>{message}</p>}

                <div className='trustedDeviceToolbar'>
                    <input aria-label='Search trusted devices' type='search' placeholder='Search name, app, or platform' value={search} onChange={event => setSearch(event.currentTarget.value)} />
                    <select aria-label='Filter by state' value={state} onChange={event => setState(event.currentTarget.value)}>
                        <option value=''>All states</option><option>Observed</option><option>Trusted</option><option>Expired</option><option>Revoked</option>
                    </select>
                    <Button type='button' className='raised cancel' title='Revoke all trust' onClick={() => void remove('/DeviceApproval/Admin/TrustedDevices', 'Revoke every trusted-device credential?')} />
                </div>

                {grouped.map(([ key, records ]) => {
                    const list = records || [];
                    const [ username, userId ] = key.split('\u0000');
                    return (
                        <section key={key} className='trustedDeviceGroup'>
                            <header><h3>{username}</h3><Button type='button' className='raised cancel' title='Revoke user trust' onClick={() => void remove(`/DeviceApproval/Admin/Users/${userId}/TrustedDevices`, `Revoke every trusted device for ${username}?`)} /></header>
                            <div className='trustedDeviceTableWrap'><table><thead><tr><th>Device</th><th>Client / platform</th><th>First / last seen</th><th>Trust</th><th>Network</th><th>Actions</th></tr></thead>
                                <tbody>{list.map(device => <tr key={device.Id}>
                                    <td>{device.FriendlyName}</td>
                                    <td>{device.AppName} {device.AppVersion}<br />{device.Platform} {device.OsVersion}</td>
                                    <td>{new Date(device.FirstSeenUtc).toLocaleString()}<br />{new Date(device.LastSeenUtc).toLocaleString()}</td>
                                    <td>{device.State}{device.RequiresFreshTwoFactor ? ' · Fresh 2FA required' : ''} · {device.Source}<br />Issued: {device.IssuedUtc ? new Date(device.IssuedUtc).toLocaleString() : 'Never'}<br />Expires: {device.ExpiresUtc ? new Date(device.ExpiresUtc).toLocaleString() : '—'}</td>
                                    <td>{device.LastIpAddress || '—'}</td>
                                    <td><Button type='button' className='raised' title={device.State === 'Trusted' ? 'Rename / edit expiry' : 'Trust this device'} onClick={() => void update(device, device.State !== 'Trusted')} /><Button type='button' className='raised cancel' title='Revoke' onClick={() => void remove(`/DeviceApproval/Admin/TrustedDevices/${device.Id}`, `Revoke ${device.FriendlyName}?`)} /></td>
                                </tr>)}</tbody>
                            </table></div>
                        </section>
                    );
                })}

                <h2>Security audit</h2>
                <div className='trustedDeviceTableWrap'><table><thead><tr><th>Time</th><th>Event</th><th>Source / result</th><th>Actor / target</th><th>Detail</th></tr></thead>
                    <tbody>{audit.map(item => <tr key={item.Id}><td>{new Date(item.TimestampUtc).toLocaleString()}</td><td>{item.Event}{item.AdministratorInvolved ? ' · Administrator' : ''}</td><td>{item.Source} · {item.Result}</td><td>{item.ActingUserId || '—'}<br />{item.TargetUserId || '—'}</td><td>{item.Detail}</td></tr>)}</tbody>
                </table></div>
            </div>
        </Page>
    );
};

export default TrustedDevicesPage;

/* eslint-enable react/jsx-no-bind, no-void */
