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

type InactiveLogoutScope = 'Device' | 'User' | 'UserExceptDevice';

const TrustedDevicesPage: FC = () => {
    const { __legacyApiClient__: api } = useApi();
    const [ devices, setDevices ] = useState<TrustedDevice[]>([]);
    const [ enabled, setEnabled ] = useState(true);
    const [ defaultDays, setDefaultDays ] = useState(30);
    const [ inactiveLogoutMinutes, setInactiveLogoutMinutes ] = useState(0);
    const [ inactiveLogoutScope, setInactiveLogoutScope ] = useState<InactiveLogoutScope>('Device');
    const [ search, setSearch ] = useState('');
    const [ state, setState ] = useState('');
    const [ message, setMessage ] = useState('');
    const [ audit, setAudit ] = useState<SecurityAudit[]>([]);
    const [ tab, setTab ] = useState<'devices' | 'audit'>('devices');

    const load = useCallback(async () => {
        if (!api) return;
        const [ policy, records, auditRecords ] = await Promise.all([
            api.getJSON(api.getUrl('/DeviceApproval/Admin/Policy')),
            api.getJSON(api.getUrl(`/DeviceApproval/Admin/TrustedDevices?search=${encodeURIComponent(search)}&state=${encodeURIComponent(state)}`)),
            api.getJSON(api.getUrl('/DeviceApproval/Admin/Audit?limit=200'))
        ]);
        setEnabled(policy.Enabled);
        setDefaultDays(policy.DefaultTrustDays);
        setInactiveLogoutMinutes(policy.InactiveLogoutMinutes || 0);
        setInactiveLogoutScope(policy.InactiveLogoutScope || 'Device');
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
        await api.ajax({ type: 'PUT', url: api.getUrl('/DeviceApproval/Admin/Policy'), data: JSON.stringify({ Enabled: enabled, DefaultTrustDays: defaultDays, InactiveLogoutMinutes: inactiveLogoutMinutes, InactiveLogoutScope: inactiveLogoutScope }), contentType: 'application/json' });
        setMessage('Device and idle-logout policies saved. Disabling trusted devices immediately revokes existing trust.');
        void load();
    }, [ api, defaultDays, enabled, inactiveLogoutMinutes, inactiveLogoutScope, load ]);

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

    const logout = useCallback(async (path: string, prompt: string) => {
        if (!api || !window.confirm(prompt)) return;
        await api.ajax({ type: 'POST', url: api.getUrl(path) });
        void load();
    }, [ api, load ]);

    const neverTrust = useCallback(async (device: TrustedDevice) => {
        if (!api || !window.confirm(`Never trust ${device.FriendlyName}? Future automatic trust attempts for this installation will be blocked.`)) return;
        await api.ajax({ type: 'POST', url: api.getUrl(`/DeviceApproval/Admin/TrustedDevices/${device.Id}/Never`) });
        void load();
    }, [ api, load ]);

    return (
        <Page id='trustedDevicesPage' title='Trusted devices' className='mainAnimatedPage type-interior'>
            <div className='content-primary trustedDevicesPage'>
                <h2>Device and idle policies</h2>
                <p>Configure trusted sign-in and the server-wide idle logout policy here. Idle logout applies to every user, including administrators. Administrator-granted trust exempts that device from triggering idle logout. While idle logout is enabled, users cannot grant trusted status to their own devices.</p>
                <form onSubmit={event => void savePolicy(event)} className='trustedDevicePolicy'>
                    <section className='trustedDevicePolicySection'>
                        <h3>Trusted sign-in</h3>
                        <label><input type='checkbox' checked={enabled} onChange={event => setEnabled(event.currentTarget.checked)} /> Enable device approval and trusted devices</label>
                        <label>Default trust duration (days)<input type='number' min='1' max='3650' value={defaultDays} onChange={event => setDefaultDays(Number(event.currentTarget.value))} /></label>
                    </section>
                    <section className='trustedDevicePolicySection'>
                        <h3>Automatic idle logout</h3>
                        <label>Global idle timeout (minutes)<input type='number' min='0' max='525600' value={inactiveLogoutMinutes} onChange={event => setInactiveLogoutMinutes(Number(event.currentTarget.value))} /></label>
                        <label>When a device reaches the timeout<select value={inactiveLogoutScope} onChange={event => setInactiveLogoutScope(event.currentTarget.value as InactiveLogoutScope)}>
                            <option value='Device'>Sign out the inactive device only</option>
                            <option value='User'>Sign out this user on all devices</option>
                            <option value='UserExceptDevice'>Sign out this user everywhere except the inactive device</option>
                        </select></label>
                        <p>Set the timeout to 0 to disable idle logout. Active playback counts as activity; paused or stopped playback does not. The “except” option keeps the device whose timer fired signed in while signing out that user’s other devices.</p>
                    </section>
                    <Button type='submit' className='raised button-submit' title='Save policy' />
                </form>
                {message && <p>{message}</p>}

                <div className='trustedDeviceTabs' role='tablist' aria-label='Trusted-device administration'>
                    <Button type='button' className={tab === 'devices' ? 'raised button-submit' : 'raised'} title='Devices' onClick={() => setTab('devices')} />
                    <Button type='button' className={tab === 'audit' ? 'raised button-submit' : 'raised'} title='Security audit' onClick={() => setTab('audit')} />
                </div>

                {tab === 'devices' && <>
                    <div className='trustedDeviceToolbar'>
                        <input aria-label='Search trusted devices' type='search' placeholder='Search name, app, or platform' value={search} onChange={event => setSearch(event.currentTarget.value)} />
                        <select aria-label='Filter by state' value={state} onChange={event => setState(event.currentTarget.value)}>
                            <option value=''>All states</option><option>Observed</option><option>Trusted</option><option>Expired</option><option>Revoked</option><option>Never</option>
                        </select>
                        <Button type='button' className='raised cancel' title='Revoke all trust' onClick={() => void remove('/DeviceApproval/Admin/TrustedDevices', 'Revoke every trusted-device credential?')} />
                        <Button type='button' className='raised cancel' title='Log out every user' onClick={() => void logout('/DeviceApproval/Admin/Users/Logout', 'Log out every user on every device? All trusted-device credentials will also be revoked.')} />
                    </div>

                    {grouped.map(([ key, records ]) => {
                        const list = records || [];
                        const [ username, userId ] = key.split('\u0000');
                        return (
                            <details key={key} className='trustedDeviceGroup' open>
                                <summary><strong>{username}</strong><span>{list.length} device{list.length === 1 ? '' : 's'}</span></summary>
                                <header><Button type='button' className='raised cancel' title='Revoke user trust' onClick={() => void remove(`/DeviceApproval/Admin/Users/${userId}/TrustedDevices`, `Revoke every trusted device for ${username}?`)} /><Button type='button' className='raised cancel' title='Log out all devices' onClick={() => void logout(`/DeviceApproval/Admin/Users/${userId}/Logout`, `Log out ${username} on every device? Their trusted-device credentials will also be revoked.`)} /></header>
                                <div className='trustedDeviceTableWrap'><table><thead><tr><th>Device</th><th>Client / platform</th><th>First / last seen</th><th>Trust</th><th>Network</th><th>Actions</th></tr></thead>
                                    <tbody>{list.map(device => <tr key={device.Id}>
                                        <td>{device.FriendlyName}</td>
                                        <td>{device.AppName} {device.AppVersion}<br />{device.Platform} {device.OsVersion}</td>
                                        <td>{new Date(device.FirstSeenUtc).toLocaleString()}<br />{new Date(device.LastSeenUtc).toLocaleString()}</td>
                                        <td>{device.State}{device.RequiresFreshTwoFactor ? ' · Fresh 2FA required' : ''} · {device.Source}<br />Issued: {device.IssuedUtc ? new Date(device.IssuedUtc).toLocaleString() : 'Never'}<br />Expires: {device.ExpiresUtc ? new Date(device.ExpiresUtc).toLocaleString() : '—'}</td>
                                        <td>{device.LastIpAddress || '—'}</td>
                                        <td><Button type='button' className='raised' title={device.State === 'Trusted' ? 'Rename / edit expiry' : 'Trust this device'} onClick={() => void update(device, device.State !== 'Trusted')} /><Button type='button' className='raised cancel' title='Log out device' onClick={() => void logout(`/DeviceApproval/Admin/TrustedDevices/${device.Id}/Logout`, `Log out ${device.FriendlyName}? A fresh 2FA check will be required before this device can use trusted sign-in again.`)} /><Button type='button' className='raised cancel' title='Revoke' onClick={() => void remove(`/DeviceApproval/Admin/TrustedDevices/${device.Id}`, `Revoke ${device.FriendlyName}?`)} />{device.State !== 'Never' && <Button type='button' className='raised cancel' title='Never trust' onClick={() => void neverTrust(device)} />}<Button type='button' className='raised cancel' title='Prune device' onClick={() => void remove(`/DeviceApproval/Admin/TrustedDevices/${device.Id}/Prune`, `Forget ${device.FriendlyName} permanently?`)} /></td>
                                    </tr>)}</tbody>
                                </table></div>
                            </details>
                        );
                    })}
                </>}

                {tab === 'audit' && <div className='trustedDeviceTableWrap'><table><thead><tr><th>Time</th><th>Event</th><th>Source / result</th><th>Actor / target</th><th>Detail</th></tr></thead>
                    <tbody>{audit.map(item => <tr key={item.Id}><td>{new Date(item.TimestampUtc).toLocaleString()}</td><td>{item.Event}{item.AdministratorInvolved ? ' · Administrator' : ''}</td><td>{item.Source} · {item.Result}</td><td>{item.ActingUserId || '—'}<br />{item.TargetUserId || '—'}</td><td>{item.Detail}</td></tr>)}</tbody>
                </table></div>}
            </div>
        </Page>
    );
};

export default TrustedDevicesPage;

/* eslint-enable react/jsx-no-bind, no-void */
