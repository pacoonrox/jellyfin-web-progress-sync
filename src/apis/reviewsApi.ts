import type { Api } from '@jellyfin/sdk';

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

function reviewsBasePath(api: Api) {
    return `${api.basePath}/Reviews`;
}

export async function getReviews(api: Api, itemId: string) {
    const response = await api.axiosInstance.get<ReviewDto[]>(
        `${reviewsBasePath(api)}/Items/${itemId}`
    );
    return response.data;
}

export async function getSummary(api: Api, itemId: string) {
    const response = await api.axiosInstance.get<ItemRatingSummaryDto>(
        `${reviewsBasePath(api)}/Items/${itemId}/Summary`
    );
    return response.data;
}

export async function getSummaries(api: Api, itemIds: string[]) {
    if (itemIds.length === 0) {
        return {};
    }

    const response = await api.axiosInstance.get<Record<string, ItemRatingSummaryDto>>(
        `${reviewsBasePath(api)}/Summaries`,
        { params: { itemIds: itemIds.join(',') } }
    );
    return response.data;
}

export async function getTopRated(api: Api, minRatingCount = 1, limit = 50) {
    const response = await api.axiosInstance.get<ItemRatingSummaryDto[]>(
        `${reviewsBasePath(api)}/TopRated`,
        { params: { minRatingCount, limit } }
    );
    return response.data;
}

export async function getMyReview(api: Api, itemId: string) {
    try {
        const response = await api.axiosInstance.get<ReviewDto>(
            `${reviewsBasePath(api)}/Items/${itemId}/Mine`
        );
        return response.data;
    } catch {
        return undefined;
    }
}

export async function getMyReviews(api: Api) {
    const response = await api.axiosInstance.get<ReviewDto[]>(
        `${reviewsBasePath(api)}/Mine`
    );
    return response.data;
}

export async function upsertReview(api: Api, itemId: string, request: UpdateReviewRequest) {
    const response = await api.axiosInstance.post<ReviewDto>(
        `${reviewsBasePath(api)}/Items/${itemId}`,
        request
    );
    return response.data;
}

export async function deleteReview(api: Api, itemId: string) {
    await api.axiosInstance.delete(`${reviewsBasePath(api)}/Items/${itemId}`);
}
