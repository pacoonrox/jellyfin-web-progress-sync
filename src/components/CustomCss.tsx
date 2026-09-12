import React, { type FC, useEffect } from 'react';

import { useUserSettings } from 'hooks/useUserSettings';
import { useBrandingOptions } from 'apps/dashboard/features/branding/api/useBrandingOptions';

import './cinematicSkin.scss';

const CustomCss: FC = () => {
    const { data: brandingOptions } = useBrandingOptions();
    const { customCss: userCustomCss, disableCustomCss, enableCinematicSkin } = useUserSettings();

    useEffect(() => {
        document.body.classList.toggle('cinematicSkin', enableCinematicSkin);

        return () => {
            document.body.classList.remove('cinematicSkin');
        };
    }, [enableCinematicSkin]);

    return (
        <>
            {!disableCustomCss && brandingOptions?.CustomCss && (
                <style>
                    {brandingOptions.CustomCss}
                </style>
            )}
            {userCustomCss && (
                <style>
                    {userCustomCss}
                </style>
            )}
        </>
    );
};

export default CustomCss;
