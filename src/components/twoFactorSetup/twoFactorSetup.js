import QRCode from 'qrcode';

import dialog from 'components/dialog/dialog';
import prompt from 'components/prompt/prompt';
import globalize from 'lib/globalize';
import escapeHtml from 'escape-html';

export async function registerTwoFactor(apiClient, userId) {
    const setupResponse = await apiClient.ajax({
        type: 'POST',
        url: apiClient.getUrl(`Users/${userId}/TwoFactor/Start`)
    });
    const setup = await setupResponse.json();
    const qrCode = await QRCode.toDataURL(setup.OtpAuthUri, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 240
    });

    await dialog.show({
        title: globalize.translate('HeaderTwoFactorSetup'),
        html: `
            <p>${globalize.translate('MessageTwoFactorSetupQr')}</p>
            <img src="${qrCode}" alt="${globalize.translate('HeaderTwoFactorSetup')}" style="display:block;margin:1em auto;max-width:240px;" />
            <p>${globalize.translate('MessageTwoFactorSetupManualKey', escapeHtml(setup.ManualEntryKey))}</p>
        `,
        buttons: [{
            name: globalize.translate('ButtonGotIt'),
            id: 'continue',
            type: 'submit'
        }]
    });

    const code = await prompt({
        title: globalize.translate('HeaderTwoFactorSetup'),
        label: globalize.translate('LabelTwoFactorCode'),
        description: globalize.translate('MessageTwoFactorSetupVerifyCode'),
        confirmText: globalize.translate('ButtonSubmit')
    });

    await apiClient.ajax({
        type: 'POST',
        data: JSON.stringify({ Code: code }),
        url: apiClient.getUrl(`Users/${userId}/TwoFactor/Enable`),
        contentType: 'application/json'
    });
}
