/* eslint-disable react/jsx-no-bind, no-void */
import React, { FC, FormEvent, useCallback, useEffect, useState } from 'react';

import Button from 'elements/emby-button/Button';
import { useApi } from 'hooks/useApi';

import type { TrustedDevice } from './index';

type IdleLogoutScopeMode = 'AllDevices' | 'NoDevices' | 'AllDevicesExceptSelected' | 'NoDevicesExceptSelected' | 'SelectedManual';

interface IdleLogoutPolicy {
    Enabled: boolean;
    Minutes: number;
    ScopeMode: IdleLogoutScopeMode;
    SelectedDeviceIds: string[];
    ManualFutureDefaultSubject: boolean;
    DeviceOverrides: Record<string, boolean>;
}

const DEFAULT_POLICY: IdleLogoutPolicy = {
    Enabled: false,
    Minutes: 5,
    ScopeMode: 'AllDevices',
    SelectedDeviceIds: [],
    ManualFutureDefaultSubject: true,
    DeviceOverrides: {}
};

interface IdleLogoutPolicySectionProps {
    userId: string;
    username: string;
    // The same trusted-device records already shown in this user's group on the parent
    // page -- reused here rather than fetched separately, so this list stays identical to
    // (and stays populated the same way as) the main Trusted devices table, including for
    // devices that no longer have a live session (e.g. one idle logout itself logged out).
    devices: TrustedDevice[];
}

const IdleLogoutPolicySection: FC<IdleLogoutPolicySectionProps> = ({ userId, username, devices }) => {
    const { __legacyApiClient__: api } = useApi();
    const [ policy, setPolicy ] = useState<IdleLogoutPolicy>(DEFAULT_POLICY);
    const [ message, setMessage ] = useState('');

    const load = useCallback(async () => {
        if (!api) return;
        const result = await api.getJSON(api.getUrl(`/DeviceApproval/Admin/Users/${userId}/IdleLogoutPolicy`)) as IdleLogoutPolicy;
        setPolicy({
            Enabled: result.Enabled,
            Minutes: result.Minutes || 5,
            ScopeMode: result.ScopeMode || 'AllDevices',
            SelectedDeviceIds: result.SelectedDeviceIds || [],
            ManualFutureDefaultSubject: result.ManualFutureDefaultSubject,
            DeviceOverrides: result.DeviceOverrides || {}
        });
    }, [ api, userId ]);

    useEffect(() => {
        void load();
    }, [ load ]);

    const save = useCallback(async (event: FormEvent) => {
        event.preventDefault();
        if (!api) return;
        await api.ajax({
            type: 'PUT',
            url: api.getUrl(`/DeviceApproval/Admin/Users/${userId}/IdleLogoutPolicy`),
            data: JSON.stringify(policy),
            contentType: 'application/json'
        });
        setMessage(`Idle logout policy saved for ${username}.`);
        void load();
    }, [ api, load, policy, userId, username ]);

    const toggleSelectedDevice = useCallback((deviceId: string, checked: boolean) => {
        setPolicy(current => ({
            ...current,
            SelectedDeviceIds: checked ?
                [ ...current.SelectedDeviceIds, deviceId ] :
                current.SelectedDeviceIds.filter(id => id !== deviceId)
        }));
    }, []);

    const toggleManualOverride = useCallback((deviceId: string, subject: boolean) => {
        setPolicy(current => ({
            ...current,
            DeviceOverrides: { ...current.DeviceOverrides, [deviceId]: subject }
        }));
    }, []);

    const clearManualOverride = useCallback((deviceId: string) => {
        setPolicy(current => {
            const DeviceOverrides = { ...current.DeviceOverrides };
            delete DeviceOverrides[deviceId];
            return { ...current, DeviceOverrides };
        });
    }, []);

    return (
        <form onSubmit={event => void save(event)} className='idleLogoutPolicy'>
            <label><input type='checkbox' checked={policy.Enabled} onChange={event => {
                const checked = event.currentTarget.checked;
                setPolicy(current => ({ ...current, Enabled: checked }));
            }} /> Enable idle logout for {username}</label>
            <label>Idle timeout (minutes)<input type='number' min='1' max='525600' value={policy.Minutes} onChange={event => {
                const minutes = Number(event.currentTarget.value);
                setPolicy(current => ({ ...current, Minutes: minutes }));
            }} /></label>
            <label>Applies to<select value={policy.ScopeMode} onChange={event => {
                const scopeMode = event.currentTarget.value as IdleLogoutScopeMode;
                setPolicy(current => ({ ...current, ScopeMode: scopeMode }));
            }}>
                <option value='AllDevices'>All devices for this user</option>
                <option value='NoDevices'>No devices for this user</option>
                <option value='AllDevicesExceptSelected'>All devices except selected (including new devices added later)</option>
                <option value='NoDevicesExceptSelected'>No devices except selected (including new devices added later)</option>
                <option value='SelectedManual'>Selected per device (manually set)</option>
            </select></label>
            <p>Each device is judged independently: a device is only signed out once it, itself, has been idle past the timeout. One device going idle never signs out another device. These settings are kept even while idle logout is disabled above.</p>

            {(policy.ScopeMode === 'AllDevicesExceptSelected' || policy.ScopeMode === 'NoDevicesExceptSelected') && <fieldset className='idleLogoutDeviceList'>
                <legend>{policy.ScopeMode === 'AllDevicesExceptSelected' ? 'Exempt devices' : 'Included devices'}</legend>
                {devices.length === 0 && <p>No devices observed for this user yet.</p>}
                {devices.map(device => (
                    <label key={device.DeviceId}>
                        <input
                            type='checkbox'
                            checked={policy.SelectedDeviceIds.includes(device.DeviceId)}
                            onChange={event => toggleSelectedDevice(device.DeviceId, event.currentTarget.checked)}
                        /> {device.FriendlyName}{device.AppName && ` (${device.AppName})`}
                    </label>
                ))}
            </fieldset>}

            {policy.ScopeMode === 'SelectedManual' && <fieldset className='idleLogoutDeviceList'>
                <legend>Per-device setting</legend>
                <label><input type='checkbox' checked={policy.ManualFutureDefaultSubject} onChange={event => {
                    const checked = event.currentTarget.checked;
                    setPolicy(current => ({ ...current, ManualFutureDefaultSubject: checked }));
                }} /> New devices added in the future are subject to idle logout by default</label>
                {devices.length === 0 && <p>No devices observed for this user yet.</p>}
                {devices.map(device => {
                    const hasOverride = Object.prototype.hasOwnProperty.call(policy.DeviceOverrides, device.DeviceId);
                    const isSubject = hasOverride ? policy.DeviceOverrides[device.DeviceId] : policy.ManualFutureDefaultSubject;
                    return (
                        <div key={device.DeviceId} className='idleLogoutManualDevice'>
                            <span>{device.FriendlyName}{device.AppName && ` (${device.AppName})`}</span>
                            <label><input type='radio' name={`idle-${userId}-${device.DeviceId}`} checked={hasOverride && isSubject} onChange={() => toggleManualOverride(device.DeviceId, true)} /> Subject</label>
                            <label><input type='radio' name={`idle-${userId}-${device.DeviceId}`} checked={hasOverride && !isSubject} onChange={() => toggleManualOverride(device.DeviceId, false)} /> Exempt</label>
                            <label><input type='radio' name={`idle-${userId}-${device.DeviceId}`} checked={!hasOverride} onChange={() => clearManualOverride(device.DeviceId)} /> Default</label>
                        </div>
                    );
                })}
            </fieldset>}

            <Button type='submit' className='raised button-submit' title={`Save idle logout policy for ${username}`} />
            {message && <p>{message}</p>}
        </form>
    );
};

export default IdleLogoutPolicySection;

/* eslint-enable react/jsx-no-bind, no-void */
