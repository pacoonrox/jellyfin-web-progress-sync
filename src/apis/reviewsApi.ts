import { ServerConnections } from 'lib/jellyfin-apiclient';

export interface ReviewDto {
    ItemId: string;
    UserId: string;
    UserName?: string;
    Rating?: number;
    Comment?: string;
    ContainsSpoilers: boolean;
    CreatedAt: string;
    UpdatedAt: string;
}

export interface ItemRatingSummaryDto {
    ItemId: string;
    AverageRating?: number;
    RatingCount: number;
    ReviewCount: number;
}

export interface UpdateReviewRequest {
    Rating?: number;
    Comment?: string;
    ContainsSpoilers?: boolean;
}

/**
 * The Reviews endpoints are called through the legacy ApiClient (rather than the
 * @jellyfin/sdk Api instance) because that Api instance is created once, very early
 * in the connection lifecycle, with whatever access token exists at that moment -
 * if the user authenticates afterwards (e.g. no persisted token, so a reconnect is
 * required), it's never refreshed and silently sends unauthenticated requests for
 * the rest of the session. The legacy ApiClient always reads the current token.
 */
function getApiClient() {
    const apiClient = ServerConnections.currentApiClient();
    if (!apiClient) {
        throw new Error('No active Jellyfin connection');
    }

    return apiClient;
}

export async function getReviews(itemId: string): Promise<ReviewDto[]> {
    const apiClient = getApiClient();
    return apiClient.getJSON(apiClient.getUrl(`Reviews/Items/${itemId}`));
}

export async function getSummary(itemId: string): Promise<ItemRatingSummaryDto> {
    const apiClient = getApiClient();
    return apiClient.getJSON(apiClient.getUrl(`Reviews/Items/${itemId}/Summary`));
}

export async function getSummaries(itemIds: string[]): Promise<Record<string, ItemRatingSummaryDto>> {
    if (itemIds.length === 0) {
        return {};
    }

    const apiClient = getApiClient();
    return apiClient.getJSON(apiClient.getUrl('Reviews/Summaries', { itemIds: itemIds.join(',') }));
}

export async function getTopRated(minRatingCount = 1, limit = 50): Promise<ItemRatingSummaryDto[]> {
    const apiClient = getApiClient();
    return apiClient.getJSON(apiClient.getUrl('Reviews/TopRated', { minRatingCount, limit }));
}

export async function getMyReview(itemId: string): Promise<ReviewDto | undefined> {
    const apiClient = getApiClient();
    try {
        return await apiClient.getJSON(apiClient.getUrl(`Reviews/Items/${itemId}/Mine`));
    } catch {
        return undefined;
    }
}

export async function getMyReviews(): Promise<ReviewDto[]> {
    const apiClient = getApiClient();
    return apiClient.getJSON(apiClient.getUrl('Reviews/Mine'));
}

export async function getAllReviews(): Promise<ReviewDto[]> {
    const apiClient = getApiClient();
    return apiClient.getJSON(apiClient.getUrl('Reviews/All'));
}

export async function upsertReview(itemId: string, request: UpdateReviewRequest): Promise<ReviewDto> {
    const apiClient = getApiClient();
    return apiClient.ajax({
        type: 'POST',
        url: apiClient.getUrl(`Reviews/Items/${itemId}`),
        data: JSON.stringify(request),
        contentType: 'application/json',
        dataType: 'json'
    });
}

export async function deleteReview(itemId: string): Promise<void> {
    const apiClient = getApiClient();
    await apiClient.ajax({
        type: 'DELETE',
        url: apiClient.getUrl(`Reviews/Items/${itemId}`)
    });
}

export async function deleteReviewAsAdmin(itemId: string, userId: string): Promise<void> {
    const apiClient = getApiClient();
    await apiClient.ajax({
        type: 'DELETE',
        url: apiClient.getUrl(`Reviews/Items/${itemId}/Users/${userId}`)
    });
}
