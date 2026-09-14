import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, type FC } from 'react';

import { EventType } from 'constants/eventType';
import { useApi } from 'hooks/useApi';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import Events from 'utils/events';
import { clearQueryCache } from 'utils/query/queryClient';

/** Component that handles mapping events to query client actions. */
const QueryClientEventHandler: FC = () => {
    const queryClient = useQueryClient();
    const { user } = useApi();

    const invalidateItemQueries = useCallback(() => (
        queryClient.invalidateQueries({
            queryKey: ['User', user?.Id, 'Items']
        })
    ), [queryClient, user?.Id]);

    useEffect(() => {
        Events.on(document, EventType.REFRESH_NEEDED, invalidateItemQueries);

        const clearUserScopedCache = () => {
            void clearQueryCache();
        };

        // Query persistence is shared by all users in the browser. Clear it
        // when authentication changes so cached image URLs and item data from
        // the previous user cannot be reused by the next user.
        Events.on(ServerConnections, 'localusersignedout', clearUserScopedCache);
        Events.on(ServerConnections, 'localusersignedin', clearUserScopedCache);

        return () => {
            Events.off(document, EventType.REFRESH_NEEDED, invalidateItemQueries);
            Events.off(ServerConnections, 'localusersignedout', clearUserScopedCache);
            Events.off(ServerConnections, 'localusersignedin', clearUserScopedCache);
        };
    }, [invalidateItemQueries]);

    return null;
};

export default QueryClientEventHandler;
