import createDOMPurify from 'dompurify';
import escapeHtml from 'escape-html';
import markdownIt from 'markdown-it';
import QRCode from 'qrcode';

import { AppFeature } from 'constants/appFeature';
import { ServerConnections } from 'lib/jellyfin-apiclient';

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
import prompt from 'components/prompt/prompt';
import { getDefaultBackgroundClass } from 'components/cardbuilder/utils/builder';

import './login.scss';

const domPurify = createDOMPurify();
domPurify.setConfig({
    // eslint-disable-next-line @typescript-eslint/naming-convention, sonarjs/regex-complexity -- DOMPurify config option; customizes its default regex
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|callto|cid|xmpp|matrix|tg|whatsapp|signal|ircs?):|[^a-z]|[a-z+.-]+(?:[^-a-z+.:]|$))/i
});

const enableFocusTransform = !browser.slow && !browser.edge;

function getQuickConnectAuthorizeUrl(code) {
    const route = '#/quickconnect?code=' + encodeURIComponent(code);

    return `${window.location.origin}${window.location.pathname}${route}`;
}

async function getQuickConnectDialogHtml(code) {
    const authorizeUrl = getQuickConnectAuthorizeUrl(code);
    let qrHtml = '';

    try {
        const qrDataUrl = await QRCode.toDataURL(authorizeUrl, {
            errorCorrectionLevel: 'M',
            margin: 1,
            width: 196,
            color: {
                dark: '#0b1016',
                light: '#ffffff'
            }
        });

        qrHtml = `<img class="quickConnectLoginQr" src="${qrDataUrl}" alt="Quick Connect QR code" />`;
    } catch (err) {
        console.warn('[LoginPage] unable to render Quick Connect QR code', err);
    }

    return `
        <div class="quickConnectLoginPrompt">
            ${qrHtml}
            <div class="quickConnectLoginCode">${escapeHtml(code)}</div>
        </div>
    `;
}

function authenticateUserByName(page, apiClient, url, username, password, twoFactorCode) {
    loading.show();
    apiClient.ajax({
        type: 'POST',
        data: JSON.stringify({
            Username: username,
            Pw: password,
            TwoFactorCode: twoFactorCode
        }),
        url: apiClient.getUrl('Users/AuthenticateByName'),
        contentType: 'application/json'
    }, true).then(response => response.json()).then(function (result) {
        const user = result.User;
        loading.hide();

        if (result.RequiresTwoFactorAuthentication) {
            page.querySelector('.twoFactorCodeContainer').classList.remove('hide');
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

function authenticateQuickConnect(apiClient, targetUrl) {
    const url = apiClient.getUrl('/QuickConnect/Initiate');
    apiClient.ajax({ type: 'POST', url }, true).then(res => res.json()).then(async function (json) {
        if (!json.Secret || !json.Code) {
            console.error('Malformed quick connect response', json);
            return false;
        }

        baseAlert({
            dialogOptions: {
                id: 'quickConnectAlert'
            },
            title: globalize.translate('QuickConnect'),
            html: await getQuickConnectDialogHtml(json.Code)
        });

        const connectUrl = apiClient.getUrl('/QuickConnect/Connect?Secret=' + json.Secret);

        const interval = setInterval(function() {
            apiClient.getJSON(connectUrl).then(async function(data) {
                if (!data.Authenticated) {
                    return;
                }

                clearInterval(interval);

                // Close the QuickConnect dialog
                const dlg = document.getElementById('quickConnectAlert');
                if (dlg) {
                    dialogHelper.close(dlg);
                }

                const result = await apiClient.quickConnect(data.Secret);
                onLoginSuccessful(result.User.Id, result.AccessToken, apiClient, targetUrl, false, result.ServerId);
            }, function (e) {
                clearInterval(interval);

                // Close the QuickConnect dialog
                const dlg = document.getElementById('quickConnectAlert');
                if (dlg) {
                    dialogHelper.close(dlg);
                }

                Dashboard.alert({
                    message: globalize.translate('QuickConnectDeactivated'),
                    title: globalize.translate('HeaderError')
                });

                console.error('Unable to login with quick connect', e);
            });
        }, 5000, connectUrl);

        return true;
    }, function(e) {
        Dashboard.alert({
            message: globalize.translate('QuickConnectNotActive'),
            title: globalize.translate('HeaderError')
        });

        console.error('Quick connect error: ', e);
        return false;
    });
}

function startRequiredTwoFactorSetup(userId, apiClient) {
    return apiClient.ajax({
        type: 'POST',
        url: apiClient.getUrl(`Users/${userId}/TwoFactor/Start`)
    }).then(response => response.json()).then(setup => {
        return prompt({
            title: globalize.translate('HeaderTwoFactorSetup'),
            label: globalize.translate('LabelTwoFactorCode'),
            description: globalize.translate('MessageTwoFactorSetupManualKey', setup.ManualEntryKey),
            confirmText: globalize.translate('ButtonSubmit')
        });
    }).then(code => {
        return apiClient.ajax({
            type: 'POST',
            data: JSON.stringify({ Code: code }),
            url: apiClient.getUrl(`Users/${userId}/TwoFactor/Enable`),
            contentType: 'application/json'
        });
    });
}

function onLoginSuccessful(id, accessToken, apiClient, url, requiresTwoFactorSetup, serverId) {
    const resolvedServerId = serverId || apiClient.serverId();
    if (!resolvedServerId) {
        toast(globalize.translate('MessageUnableToConnectToServer'));
        return;
    }

    const authenticationResult = {
        AccessToken: accessToken,
        ServerId: resolvedServerId,
        User: { Id: id }
    };

    // The raw login request bypasses ApiClient.authenticateUserByName, so invoke
    // the normal callback to install the token in both legacy and SDK clients.
    Promise.resolve(apiClient.onAuthenticated?.(apiClient, authenticationResult)).then(() => {
        Dashboard.onServerChanged(id, accessToken, apiClient);

        if (requiresTwoFactorSetup) {
            loading.show();
            startRequiredTwoFactorSetup(id, apiClient).then(() => {
                loading.hide();
                Dashboard.navigate(url || 'home');
            }, () => {
                loading.hide();
                toast(globalize.translate('MessageTwoFactorSetupRequired'));
            });
            return;
        }

        Dashboard.navigate(url || 'home');
    });
}

function showManualForm(context, showCancel, focusPassword) {
    appSettings.enableAutoLogin(false);
    context.querySelector('.manualLoginForm').classList.remove('hide');
    context.querySelector('.visualLoginForm').classList.add('hide');
    context.querySelector('.btnManual').classList.add('hide');
    context.querySelector('.twoFactorCodeContainer').classList.add('hide');
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
            view.querySelector('#txtTwoFactorCode').value);
        e.preventDefault();
        return false;
    });
    view.querySelector('.btnCancel').addEventListener('click', showVisualForm);
    view.querySelector('.btnQuick').addEventListener('click', function () {
        authenticateQuickConnect(getApiClient(), getTargetUrl());
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

        apiClient.getQuickConnect('Enabled')
            .then(enabled => {
                if (enabled === true) {
                    view.querySelector('.btnQuick').classList.remove('hide');
                }
            })
            .catch(() => {
                console.debug('Failed to get QuickConnect status');
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
