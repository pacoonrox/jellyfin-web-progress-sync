/* eslint-disable react/jsx-no-bind, no-void, compat/compat */
import React, { FC, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import Page from 'components/Page';
import Button from 'elements/emby-button/Button';
import 'elements/emby-checkbox/emby-checkbox';
import Input from 'elements/emby-input/Input';
import { useApi } from 'hooks/useApi';

import './quickConnect.scss';

interface PendingDevice {
    Id: string;
    DeviceName: string;
    AppName: string;
    AppVersion: string;
    Platform: string;
    OsVersion: string;
    ConnectionDomain: string;
    RequestingIpAddress?: string;
    CreatedUtc: string;
    ExpiresUtc: string;
    State: 'Pending' | 'Selected';
    TrustAllowed: boolean;
    TrustDurationDays: number;
}

const QuickConnectPage: FC = () => {
    const { __legacyApiClient__: api, user } = useApi();
    const [ requests, setRequests ] = useState<PendingDevice[]>([]);
    const [ selected, setSelected ] = useState<PendingDevice>();
    const [ trustDevice, setTrustDevice ] = useState(false);
    const [ error, setError ] = useState<string>();
    const [ legacyCode, setLegacyCode ] = useState('');
    const [ legacyResult, setLegacyResult ] = useState<string>();
    const [ now, setNow ] = useState(Date.now());
    const isAdministrator = user?.Policy?.IsAdministrator === true;

    const accountLabel = useMemo(() => `${user?.Name ?? 'Unknown'} — ${isAdministrator ? 'Administrator' : 'Standard User'}`, [ isAdministrator, user?.Name ]);

    // Rendering `<input is='emby-checkbox'>` as plain JSX makes React call
    // document.createElement('input', { is: 'emby-checkbox' }) — the modern
    // options-object form. The vendored webcomponents.js polyfill (0.7.24)
    // only understands a raw string second argument and crashes trying to
    // call .toLowerCase() on that object. Every other checkbox in this app
    // avoids that by injecting the "is" markup via dangerouslySetInnerHTML
    // so the browser's native HTML parser instantiates it instead; do the
    // same here and wire the controlled state up through a ref.
    const trustCheckboxRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const input = trustCheckboxRef.current?.querySelector('input');
        if (!input) return undefined;
        const onChange = () => setTrustDevice(input.checked);
        input.addEventListener('change', onChange);
        return () => input.removeEventListener('change', onChange);
    }, [ selected?.Id ]);

    useEffect(() => {
        const input = trustCheckboxRef.current?.querySelector('input');
        if (input) input.checked = trustDevice;
    }, [ trustDevice, selected?.Id ]);

    const refresh = useCallback(async () => {
        if (!api) return;
        try {
            const data = await api.getJSON(api.getUrl('/DeviceApproval/Queue')) as PendingDevice[];
            setRequests(data);
        } catch {
            setError('Unable to load pending sign-on requests.');
        }
    }, [ api ]);

    useEffect(() => {
        if (api) {
            void api.ajax({
                type: 'POST',
                url: api.getUrl('/DeviceApproval/Portal/Entered')
            }).catch(() => undefined);
        }
        void refresh();
        const interval = window.setInterval(() => {
            setNow(Date.now());
            void refresh();
        }, 1000);
        return () => window.clearInterval(interval);
    }, [ api, refresh ]);

    useEffect(() => {
        // A queue request that started before Select can resolve afterward with
        // the old Pending state.  The request is only gone when its id drops
        // out of the queue; requiring Selected here dismisses a successful
        // selection immediately when that stale snapshot wins the race.
        if (selected && !requests.some(request => request.Id === selected.Id)) {
            setSelected(undefined);
            setTrustDevice(false);
            setError('The requesting device canceled or closed this approval request.');
        }
    }, [ requests, selected ]);

    const selectRequest = useCallback(async (request: PendingDevice) => {
        if (!api) return;
        setError(undefined);
        try {
            // Ask the legacy client to deserialize this response.  Depending on
            // the client version, ajax() otherwise returns either a Fetch
            // Response or an already-parsed object; relying on Response.json()
            // made the confirmation state disappear on clients that parse JSON.
            const selectedDevice = await api.ajax({
                type: 'POST',
                url: api.getUrl(`/DeviceApproval/Queue/${encodeURIComponent(request.Id)}/Select`),
                dataType: 'json',
                headers: { accept: 'application/json' }
            });
            const parsedDevice = selectedDevice?.json ? await selectedDevice.json() : selectedDevice;
            setSelected(parsedDevice);
            setTrustDevice(parsedDevice?.TrustAllowed === true);
        } catch {
            setError('This request was selected elsewhere, expired, or cannot be approved by this session.');
            void refresh();
        }
    }, [ api, refresh ]);

    const confirm = useCallback(async (approved: boolean) => {
        if (!api || !selected) return;
        try {
            await api.ajax({
                type: 'POST',
                url: api.getUrl(`/DeviceApproval/Queue/${encodeURIComponent(selected.Id)}/Confirm`),
                data: JSON.stringify({ Matches: approved, TrustDevice: approved && selected.TrustAllowed && trustDevice }),
                contentType: 'application/json'
            });
            setSelected(undefined);
            setTrustDevice(false);
            void refresh();
        } catch {
            setError('Approval did not complete. The request may have expired or been completed elsewhere.');
            setSelected(undefined);
            setTrustDevice(false);
            void refresh();
        }
    }, [ api, refresh, selected, trustDevice ]);

    const authorizeLegacy = useCallback(async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!api || !event.currentTarget.checkValidity()) return;

        const code = legacyCode.replace(/\s/g, '');
        setLegacyResult(undefined);
        try {
            await api.ajax({
                type: 'POST',
                url: api.getUrl(`/QuickConnect/Authorize?code=${encodeURIComponent(code)}`)
            });
            setLegacyCode('');
            setLegacyResult('Device approved.');
        } catch {
            setLegacyResult('Code not found or expired.');
        }
    }, [ api, legacyCode ]);

    return (
        <Page
            id='quickConnectPreferencesPage'
            title='Quick Sign-On'
            className='mainAnimatedPage libraryPage userPreferencesPage noSecondaryNavPage'
            shouldAutoFocus
        >
            <div className='padded-left padded-right padded-bottom-page deviceApprovalPortal'>
                <h2>Quick Sign-On</h2>
                <p>Approve a device to sign in as <strong>{accountLabel}</strong>.</p>
                {error && <div className='quickConnectError'>{error}</div>}

                {selected && (
                    <section className='deviceApprovalConfirmation'>
                        <h2>Approve {selected.DeviceName}?</h2>
                        <p>{selected.AppName} {selected.AppVersion} · {selected.ConnectionDomain || 'Unknown connection'}</p>
                        {selected.TrustAllowed && (
                            <div
                                ref={trustCheckboxRef}
                                className='checkboxContainer'
                                dangerouslySetInnerHTML={{
                                    __html: `<label>
                                        <input is="emby-checkbox" type="checkbox" />
                                        <span>Trust this device for ${selected.TrustDurationDays || 30} days</span>
                                    </label>`
                                }}
                            />
                        )}
                        <div className='deviceApprovalActions'>
                            <Button type='button' className='raised button-submit' title='Approve' onClick={() => void confirm(true)} />
                            <Button type='button' className='raised cancel' title='Not this device' onClick={() => void confirm(false)} />
                        </div>
                    </section>
                )}

                <div className='deviceApprovalGrid'>
                    {requests.filter(request => request.State === 'Pending').map(request => {
                        const seconds = Math.max(0, Math.ceil((new Date(request.ExpiresUtc).getTime() - now) / 1000));
                        return (
                            <article className='deviceApprovalCard' key={request.Id}>
                                <h3>{request.DeviceName}</h3>
                                <dl>
                                    <dt>Client</dt><dd>{request.AppName} {request.AppVersion}</dd>
                                    <dt>Platform</dt><dd>{request.Platform || 'Unknown'} {request.OsVersion}</dd>
                                    <dt>Connection domain</dt><dd>{request.ConnectionDomain || 'Unknown'}</dd>
                                    <dt>Entered queue</dt><dd>{new Date(request.CreatedUtc).toLocaleString()}</dd>
                                    <dt>Expires in</dt><dd>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</dd>
                                    {isAdministrator && <><dt>Requesting IP</dt><dd>{request.RequestingIpAddress || 'Unknown'}</dd></>}
                                </dl>
                                <Button type='button' className='raised button-submit block' title='Select device' onClick={() => void selectRequest(request)} />
                            </article>
                        );
                    })}
                    {!requests.some(request => request.State === 'Pending') && <p>No devices waiting.</p>}
                </div>

                <section className='legacyQuickConnect'>
                    <h2>Legacy Quick Connect</h2>
                    <p>For Roku, Swiftfin, and other apps that display a six-digit code.</p>
                    <form className='legacyQuickConnectForm' onSubmit={authorizeLegacy}>
                        <Input
                            id='txtLegacyQuickConnectCode'
                            value={legacyCode}
                            onChange={event => {
                                setLegacyCode(event.currentTarget.value);
                                setLegacyResult(undefined);
                            }}
                            label='Quick Connect code'
                            type='text'
                            inputMode='numeric'
                            pattern='[0-9\s]*'
                            minLength={6}
                            maxLength={6}
                            required
                            autoComplete='off'
                        />
                        <Button type='submit' className='raised button-submit' title='Approve code' />
                    </form>
                    {legacyResult && <p className='legacyQuickConnectResult'>{legacyResult}</p>}
                </section>
            </div>
        </Page>
    );
};

export default QuickConnectPage;

/* eslint-enable react/jsx-no-bind, no-void, compat/compat */
