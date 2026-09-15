/* eslint-disable react/jsx-no-bind, no-void, compat/compat */
import React, { FC, useCallback, useEffect, useMemo, useState } from 'react';

import Page from 'components/Page';
import Button from 'elements/emby-button/Button';
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
    MatchingValue?: string;
    TrustAllowed: boolean;
    TrustDurationDays: number;
}

const QuickConnectPage: FC = () => {
    const { __legacyApiClient__: api, user } = useApi();
    const [ requests, setRequests ] = useState<PendingDevice[]>([]);
    const [ selected, setSelected ] = useState<PendingDevice>();
    const [ trustDevice, setTrustDevice ] = useState(false);
    const [ error, setError ] = useState<string>();
    const [ now, setNow ] = useState(Date.now());
    const isAdministrator = user?.Policy?.IsAdministrator === true;

    const accountLabel = useMemo(() => `${user?.Name ?? 'Unknown'} — ${isAdministrator ? 'Administrator' : 'Standard User'}`, [ isAdministrator, user?.Name ]);

    const refresh = useCallback(async () => {
        if (!api) return;
        try {
            const data = await api.getJSON(api.getUrl('/DeviceApproval/Queue')) as PendingDevice[];
            setRequests(data);
            setError(undefined);
        } catch {
            setError('A fresh direct password and 2FA login is required before this session can approve devices.');
        }
    }, [ api ]);

    useEffect(() => {
        void refresh();
        const interval = window.setInterval(() => {
            setNow(Date.now());
            void refresh();
        }, 1000);
        return () => window.clearInterval(interval);
    }, [ refresh ]);

    const selectRequest = useCallback(async (request: PendingDevice) => {
        if (!api) return;
        setError(undefined);
        try {
            const response = await api.ajax({ type: 'POST', url: api.getUrl(`/DeviceApproval/Queue/${encodeURIComponent(request.Id)}/Select`) });
            setSelected(await response.json());
        } catch {
            setError('This request was selected elsewhere, expired, or this session needs fresh direct 2FA.');
            void refresh();
        }
    }, [ api, refresh ]);

    const confirm = useCallback(async (matches: boolean) => {
        if (!api || !selected) return;
        try {
            await api.ajax({
                type: 'POST',
                url: api.getUrl(`/DeviceApproval/Queue/${encodeURIComponent(selected.Id)}/Confirm`),
                data: JSON.stringify({ Matches: matches, TrustDevice: matches && selected.TrustAllowed && trustDevice }),
                contentType: 'application/json'
            });
            setSelected(undefined);
            setTrustDevice(false);
            void refresh();
        } catch {
            setError('Approval did not complete. The request may have expired or been completed elsewhere.');
            setSelected(undefined);
            void refresh();
        }
    }, [ api, refresh, selected, trustDevice ]);

    return (
        <Page
            id='quickConnectPreferencesPage'
            title='Quick Sign-On'
            className='mainAnimatedPage libraryPage userPreferencesPage noSecondaryNavPage'
            shouldAutoFocus
        >
            <div className='padded-left padded-right padded-bottom-page deviceApprovalPortal'>
                <h2>Shared device-approval portal</h2>
                <p className='deviceApprovalIdentity'>Approving as <strong>{accountLabel}</strong></p>
                <p>Every authenticated user sees the same anonymous queue. If you approve a request, that device will be signed in as <strong>{accountLabel}</strong> and receive your permissions.</p>
                {error && <div className='quickConnectError'>{error}</div>}

                {selected && (
                    <section className='deviceApprovalConfirmation'>
                        <h2>Selected Device</h2>
                        <p>Yes will sign this device in as <strong>{accountLabel}</strong>. No other account will be used.</p>
                        <div className='deviceApprovalMatchingValue'>{selected.MatchingValue}</div>
                        <p>Does the requesting device display the same “Selected Device” prompt and value?</p>
                        {selected.TrustAllowed ? (
                            <label className='deviceApprovalTrust'>
                                <input type='checkbox' checked={trustDevice} onChange={event => setTrustDevice(event.currentTarget.checked)} />
                                Trust this device for {selected.TrustDurationDays || 30} days
                            </label>
                        ) : (
                            <p>Self-service trust is unavailable because this account has automatic logout enabled.</p>
                        )}
                        <div className='deviceApprovalActions'>
                            <Button type='button' className='raised button-submit' title='Yes' onClick={() => void confirm(true)} />
                            <Button type='button' className='raised cancel' title='No' onClick={() => void confirm(false)} />
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
                    {!requests.some(request => request.State === 'Pending') && <p>No devices are waiting for approval.</p>}
                </div>
            </div>
        </Page>
    );
};

export default QuickConnectPage;

/* eslint-enable react/jsx-no-bind, no-void, compat/compat */
