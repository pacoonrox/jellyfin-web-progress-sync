import { useQuery } from '@tanstack/react-query';
import type { AxiosRequestConfig } from 'axios';

import { type JellyfinApiContext, useApi } from './useApi';

const fetchQuickConnectEnabled = async (
    apiContext: JellyfinApiContext,
    options?: AxiosRequestConfig
) => {
    const { api, __legacyApiClient__: legacyApi } = apiContext;
    if (!api || !legacyApi) throw new Error('No API instance available');

    const response = await api.axiosInstance.get<boolean>(legacyApi.getUrl('/DeviceApproval/Enabled'), options);
    return response.data;
};

export const useQuickConnectEnabled = () => {
    const currentApi = useApi();
    return useQuery({
        queryKey: [ 'DeviceApproval', 'Enabled' ],
        queryFn: ({ signal }) => fetchQuickConnectEnabled(currentApi, { signal })
    });
};
