import createDOMPurify from 'dompurify';
import markdownIt from 'markdown-it';

import { AppFeature } from 'constants/appFeature';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import { registerTwoFactor } from 'components/twoFactorSetup/twoFactorSetup';
import Events from 'utils/events';
import { setSessionAuthentication } from 'utils/sessionAuthentication';
import { getDeviceCredential } from 'utils/deviceCredential';

import { appHost } from 'components/apphost';
import appSettings from 'scripts/settings/appSettings';
import dom from 'utils/dom';
import loading from 'components/loading/loading';
import layoutManager from 'components/layoutManager';
import libraryMenu from 'scripts/libraryMenu';
import browser from 'scripts/browser';
import globalize from 'lib/globalize';
import 'components/cardbuilder/card.scss';
import 'elements/emby-checkbox/emby-checkbox';
import Dashboard from 'utils/dashboard';
import toast from 'components/toast/toast';
import dialogHelper from 'components/dialogHelper/dialogHelper';
import baseAlert from 'components/alert';
import { getDefaultBackgroundClass } from 'components/cardbuilder/utils/builder';

import './login.scss';

const domPurify = createDOMPurify();
domPurify.setConfig({
    // eslint-disable-next-line @typescript-eslint/naming-convention, sonarjs/regex-complexity -- DOMPurify config option; customizes its default regex
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|callto|cid|xmpp|matrix|tg|whatsapp|signal|ircs?):|[^a-z]|[a-z+.-]+(?:[^-a-z+.:]|$))/i
});

const enableFocusTransform = !browser.slow && !browser.edge;

function authenticateUserByName(page, apiClient, url, username, password, twoFactorCode, trustDevice) {
    loading.show();
    let deviceCredential = '';
    try {
        deviceCredential = getDeviceCredential();
    } catch (err) {
        // Older clients can still use password/TOTP; they simply cannot opt into trust.
        console.warn('[LoginPage] secure device storage unavailable', err);
    }
    apiClient.ajax({
        type: 'POST',
        data: JSON.stringify({
            Username: username,
            Pw: password,
            TwoFactorCode: twoFactorCode,
            DeviceCredential: deviceCredential,
            TrustDevice: trustDevice === true,
            Platform: navigator.userAgent || '',
            OsVersion: navigator.userAgent || ''
        }),
        url: apiClient.getUrl('Users/AuthenticateByName'),
        contentType: 'application/json'
    }, true).then(response => response.json()).then(function (result) {
        const user = result.User;
        loading.hide();

        if (result.RequiresTwoFactorAuthentication) {
            page.querySelector('.twoFactorCodeContainer').classList.remove('hide');
            const canSelfTrust = result.CanTrustDevice === true && !!deviceCredential;
            page.querySelector('.trustDeviceContainer').classList.toggle('hide', !canSelfTrust);
            page.querySelector('.trustDeviceLabel').textContent = `Trust this device for ${result.TrustedDeviceDefaultDays || 30} days`;
            page.querySelector('#chkTrustDevice').checked = false;
            page.querySelector('#txtTwoFactorCode').value = '';
            page.querySelector('#txtTwoFactorCode').focus();
            toast(globalize.translate('MessageTwoFactorCodeRequired'));
            return;
        }

        onLoginSuccessful(user.Id, result.AccessToken, apiClient, url, result.RequiresTwoFactorSetup, result.ServerId);
    }, function (response) {
        page.querySelector('#txtManualPassword').value = '';
        page.querySelector('#txtTwoFactorCode').value = '';
        loading.hide();

        const UnauthorizedOrForbidden = [401, 403];
        if (UnauthorizedOrForbidden.includes(response.status)) {
            const messageKey = response.status === 401 ? 'MessageInvalidUser' : 'MessageUnauthorizedUser';
            toast(globalize.translate(messageKey));
        } else {
            Dashboard.alert({
                message: globalize.translate('MessageUnableToConnectToServer'),
                title: globalize.translate('HeaderConnectionFailure')
            });
        }
    });
}

function authenticateDeviceApproval(apiClient, targetUrl) {
    let deviceCredential;
    try {
        deviceCredential = getDeviceCredential();
    } catch {
        Dashboard.alert({ message: 'This client cannot create a secure installation credential.', title: globalize.translate('HeaderError') });
        return false;
    }
    const url = apiClient.getUrl('/DeviceApproval/Requests');
    apiClient.ajax({
        type: 'POST',
        url,
        data: JSON.stringify({
            DeviceCredential: deviceCredential,
            Platform: navigator.userAgent || '',
            OsVersion: navigator.userAgent || ''
        }),
        contentType: 'application/json'
    }, true).then(res => res.json()).then(function (json) {
        if (!json.RequestSecret) {
            console.error('Malformed device approval response');
            return false;
        }

        baseAlert({
            dialogOptions: {
                id: 'deviceApprovalAlert'
            },
            title: 'Quick Sign-On',
            html: '<div class="deviceApprovalWaiting"><h2>Waiting for approval</h2><p>Open Quick Sign-On from any directly authenticated Jellyfin session.</p><div class="deviceApprovalMatch"></div><button type="button" class="raised cancel cancelDeviceApproval">Cancel</button></div>'
        });

        const connectUrl = apiClient.getUrl('/DeviceApproval/Requests/Status?secret=' + encodeURIComponent(json.RequestSecret));
        const cancelButton = document.querySelector('#deviceApprovalAlert .cancelDeviceApproval');
        if (cancelButton) {
            cancelButton.addEventListener('click', function () {
                clearInterval(interval);
                apiClient.ajax({ type: 'DELETE', url: apiClient.getUrl('/DeviceApproval/Requests?secret=' + encodeURIComponent(json.RequestSecret)) });
                const dlg = document.getElementById('deviceApprovalAlert');
                if (dlg) dialogHelper.close(dlg);
            });
        }

        const interval = setInterval(function() {
            apiClient.getJSON(connectUrl).then(async function(data) {
                const match = document.querySelector('#deviceApprovalAlert .deviceApprovalMatch');
                if (match && data.State === 'Selected') {
                    while (match.firstChild) {
                        match.removeChild(match.firstChild);
                    }
                    const heading = document.createElement('h3');
                    heading.textContent = 'Selected Device';
                    const value = document.createElement('div');
                    value.className = 'quickConnectLoginCode';
                    value.textContent = data.MatchingValue;
                    const instruction = document.createElement('p');
                    instruction.textContent = 'Confirm that this value appears on the approving device.';
                    match.append(heading, value, instruction);
                }
                if (data.State !== 'Approved' || !data.AuthenticationResult) {
                    return;
                }

                clearInterval(interval);
                const dlg = document.getElementById('deviceApprovalAlert');
                if (dlg) {
                    dialogHelper.close(dlg);
                }

                const result = data.AuthenticationResult;
                onLoginSuccessful(result.User.Id, result.AccessToken, apiClient, targetUrl, false, result.ServerId);
            }, function (e) {
                clearInterval(interval);

                // Close the QuickConnect dialog
                const dlg = document.getElementById('deviceApprovalAlert');
                if (dlg) {
                    dialogHelper.close(dlg);
                }

                Dashboard.alert({
                    message: 'The device-approval request was canceled or expired.',
                    title: globalize.translate('HeaderError')
                });

                console.error('Unable to login with quick connect', e);
            });
        }, 2000, connectUrl);

        return true;
    }, function(e) {
        Dashboard.alert({
            message: 'The shared device-approval portal is not available.',
            title: globalize.translate('HeaderError')
        });

        console.error('Device approval error: ', e);
        return false;
    });
}

function startRequiredTwoFactorSetup(userId, apiClient) {
    return registerTwoFactor(apiClient, userId);
}

function onLoginSuccessful(id, accessToken, apiClient, url, requiresTwoFactorSetup, serverId) {
    const serverInfo = apiClient.serverInfo() || {};
    const resolvedServerId = serverId || serverInfo.Id || apiClient.serverId();
    if (!resolvedServerId) {
        toast(globalize.translate('MessageUnableToConnectToServer'));
        return;
    }

    // The raw login request bypasses ApiClient.authenticateUserByName. Install
    // the token directly so connection discovery cannot discard the server id.
    apiClient.setAuthenticationInfo(accessToken, id);
    apiClient._sdk?.update({ accessToken });
    if (requiresTwoFactorSetup) {
        loading.show();
        startRequiredTwoFactorSetup(id, apiClient).then(() => {
            loading.hide();
            setSessionAuthentication(resolvedServerId, id, accessToken);
            return ServerConnections.onLocalUserSignedIn({ Id: id, ServerId: resolvedServerId });
        }).then(() => {
            Events.trigger(ServerConnections, 'localusersignedin', [{ Id: id, ServerId: resolvedServerId }]);
            Dashboard.navigate(url || 'home');
        }, () => {
            loading.hide();
            toast(globalize.translate('MessageTwoFactorSetupRequired'));
        });
        return;
    }

    setSessionAuthentication(resolvedServerId, id, accessToken);
    ServerConnections.onLocalUserSignedIn({ Id: id, ServerId: resolvedServerId }).then(() => {
        Events.trigger(ServerConnections, 'localusersignedin', [{ Id: id, ServerId: resolvedServerId }]);
        Dashboard.navigate(url || 'home');
    }, () => {
        toast(globalize.translate('MessageUnableToConnectToServer'));
    });
}

function showManualForm(context, showCancel, focusPassword) {
    appSettings.enableAutoLogin(false);
    context.querySelector('.manualLoginForm').classList.remove('hide');
    context.querySelector('.visualLoginForm').classList.add('hide');
    context.querySelector('.btnManual').classList.add('hide');
    context.querySelector('.twoFactorCodeContainer').classList.add('hide');
    context.querySelector('.trustDeviceContainer').classList.add('hide');
    context.querySelector('#chkTrustDevice').checked = false;
    context.querySelector('#txtTwoFactorCode').value = '';

    if (focusPassword) {
        context.querySelector('#txtManualPassword').focus();
    } else {
        context.querySelector('#txtManualName').focus();
    }

    if (showCancel) {
        context.querySelector('.btnCancel').classList.remove('hide');
    } else {
        context.querySelector('.btnCancel').classList.add('hide');
    }
}

function loadUserList(context, apiClient, users) {
    let html = '';

    for (const user of users) {
        // TODO move card creation code to Card component
        let cssClass = 'card squareCard scalableCard squareCard-scalable';

        if (layoutManager.tv) {
            cssClass += ' show-focus';

            if (enableFocusTransform) {
                cssClass += ' show-animation';
            }
        }

        const cardBoxCssClass = 'cardBox cardBox-bottompadded';
        html += '<button type="button" class="' + cssClass + '">';
        html += '<div class="' + cardBoxCssClass + '">';
        html += '<div class="cardScalable">';
        html += '<div class="cardPadder cardPadder-square"></div>';
        html += `<div class="cardContent" data-haspw="${user.HasPassword}" data-username="${user.Name}" data-userid="${user.Id}">`;
        let imgUrl;

        if (user.PrimaryImageTag) {
            imgUrl = apiClient.getUserImageUrl(user.Id, {
                width: 300,
                tag: user.PrimaryImageTag,
                type: 'Primary'
            });

            html += '<div class="cardImageContainer coveredImage" style="background-image:url(\'' + imgUrl + "');\"></div>";
        } else {
            html += `<div class="cardImage flex align-items-center justify-content-center ${getDefaultBackgroundClass()}">`;
            html += '<span class="material-icons cardImageIcon person" aria-hidden="true"></span>';
            html += '</div>';
        }

        html += '</div>';
        html += '</div>';
        html += '<div class="cardFooter visualCardBox-cardFooter">';
        html += '<div class="cardText singleCardText cardTextCentered">' + user.Name + '</div>';
        html += '</div>';
        html += '</div>';
        html += '</button>';
    }

    context.querySelector('#divUsers').innerHTML = html;
}

export default function (view, params) {
    function getApiClient() {
        const serverId = params.serverid;

        if (serverId) {
            return ServerConnections.getOrCreateApiClient(serverId);
        }

        return ApiClient;
    }

    function getTargetUrl() {
        if (params.url) {
            try {
                return decodeURIComponent(params.url);
            } catch (err) {
                console.warn('[LoginPage] unable to decode url param', params.url, err);
            }
        }

        return '/home';
    }

    function showVisualForm() {
        view.querySelector('.visualLoginForm').classList.remove('hide');
        view.querySelector('.manualLoginForm').classList.add('hide');
        view.querySelector('.btnManual').classList.remove('hide');

        import('components/autoFocuser').then(({ default: autoFocuser }) => {
            autoFocuser.autoFocus(view);
        });
    }

    view.querySelector('#divUsers').addEventListener('click', function (e) {
        const card = dom.parentWithClass(e.target, 'card');
        const cardContent = card ? card.querySelector('.cardContent') : null;

        if (cardContent) {
            const context = view;
            const id = cardContent.getAttribute('data-userid');
            const name = cardContent.getAttribute('data-username');
            const haspw = cardContent.getAttribute('data-haspw');

            if (id === 'manual') {
                context.querySelector('#txtManualName').value = '';
                showManualForm(context, true);
            } else if (haspw == 'false') {
                authenticateUserByName(context, getApiClient(), getTargetUrl(), name, '');
            } else {
                context.querySelector('#txtManualName').value = name;
                context.querySelector('#txtManualPassword').value = '';
                showManualForm(context, true, true);
            }
        }
    });
    view.querySelector('.manualLoginForm').addEventListener('submit', function (e) {
        appSettings.enableAutoLogin(false);
        authenticateUserByName(
            view,
            getApiClient(),
            getTargetUrl(),
            view.querySelector('#txtManualName').value,
            view.querySelector('#txtManualPassword').value,
            view.querySelector('#txtTwoFactorCode').value,
            !view.querySelector('.trustDeviceContainer').classList.contains('hide') && view.querySelector('#chkTrustDevice').checked);
        e.preventDefault();
        return false;
    });
    view.querySelector('.btnCancel').addEventListener('click', showVisualForm);
    view.querySelector('.btnQuick').addEventListener('click', function () {
        authenticateDeviceApproval(getApiClient(), getTargetUrl());
        return false;
    });
    view.querySelector('.btnManual').addEventListener('click', function () {
        view.querySelector('#txtManualName').value = '';
        showManualForm(view, true);
    });
    view.querySelector('.btnSelectServer').addEventListener('click', function () {
        Dashboard.selectServer();
    });

    view.addEventListener('viewshow', function () {
        loading.show();
        libraryMenu.setTransparentMenu(true);

        if (!appHost.supports(AppFeature.MultiServer)) {
            view.querySelector('.btnSelectServer').classList.add('hide');
        }

        const apiClient = getApiClient();

        apiClient.getJSON(apiClient.getUrl('/DeviceApproval/Enabled'))
            .then(enabled => {
                if (enabled === true) {
                    view.querySelector('.btnQuick').classList.remove('hide');
                }
            })
            .catch(() => {
                console.debug('Failed to get device approval status');
            });

        apiClient.getPublicUsers().then(function (users) {
            if (users.length) {
                showVisualForm();
                loadUserList(view, apiClient, users);
            } else {
                view.querySelector('#txtManualName').value = '';
                showManualForm(view, false, false);
            }
        }).catch().then(function () {
            loading.hide();
        });
        apiClient.getJSON(apiClient.getUrl('Branding/Configuration')).then(function (options) {
            const loginDisclaimer = view.querySelector('.loginDisclaimer');

            // eslint-disable-next-line sonarjs/disabled-auto-escaping
            loginDisclaimer.innerHTML = domPurify.sanitize(markdownIt({ html: true }).render(options.LoginDisclaimer || ''));

            for (const elem of loginDisclaimer.querySelectorAll('a')) {
                elem.rel = 'noopener noreferrer';
                elem.target = '_blank';
                elem.classList.add('button-link');
                elem.setAttribute('is', 'emby-linkbutton');

                if (layoutManager.tv) {
                    // Disable links navigation on TV
                    elem.tabIndex = -1;
                }
            }
        });
    });
    view.addEventListener('viewhide', function () {
        libraryMenu.setTransparentMenu(false);
    });
}
