import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as reviewsApi from 'apis/reviewsApi';
import type { UpdateReviewRequest } from 'apis/reviewsApi';
import { useApi } from 'hooks/useApi';

export const useGetItemRatingSummary = (itemId?: string | null) => {
    const { api } = useApi();

    return useQuery({
        queryKey: ['ReviewSummary', itemId],
        queryFn: () => reviewsApi.getSummary(api!, itemId!),
        enabled: !!api && !!itemId
    });
};

export const useGetItemReviews = (itemId?: string | null) => {
    const { api } = useApi();

    return useQuery({
        queryKey: ['Reviews', itemId],
        queryFn: () => reviewsApi.getReviews(api!, itemId!),
        enabled: !!api && !!itemId
    });
};

export const useGetMyReview = (itemId?: string | null) => {
    const { api, user } = useApi();

    return useQuery({
        queryKey: ['MyReview', itemId, user?.Id],
        queryFn: () => reviewsApi.getMyReview(api!, itemId!),
        enabled: !!api && !!user?.Id && !!itemId
    });
};

export const useGetMyReviews = () => {
    const { api, user } = useApi();

    return useQuery({
        queryKey: ['MyReviews', user?.Id],
        queryFn: () => reviewsApi.getMyReviews(api!),
        enabled: !!api && !!user?.Id
    });
};

export const useGetTopRatedItems = (minRatingCount = 1, limit = 50) => {
    const { api } = useApi();

    return useQuery({
        queryKey: ['TopRatedItems', minRatingCount, limit],
        queryFn: () => reviewsApi.getTopRated(api!, minRatingCount, limit),
        enabled: !!api
    });
};

export const useUpsertReview = (itemId: string) => {
    const { api, user } = useApi();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (request: UpdateReviewRequest) => reviewsApi.upsertReview(api!, itemId, request),
        onSuccess: async () => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['ReviewSummary', itemId] }),
                queryClient.invalidateQueries({ queryKey: ['Reviews', itemId] }),
                queryClient.invalidateQueries({ queryKey: ['MyReview', itemId, user?.Id] }),
                queryClient.invalidateQueries({ queryKey: ['MyReviews', user?.Id] }),
                queryClient.invalidateQueries({ queryKey: ['TopRatedItems'] })
            ]);
        }
    });
};

export const useDeleteReview = (itemId: string) => {
    const { api, user } = useApi();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: () => reviewsApi.deleteReview(api!, itemId),
        onSuccess: async () => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['ReviewSummary', itemId] }),
                queryClient.invalidateQueries({ queryKey: ['Reviews', itemId] }),
                queryClient.invalidateQueries({ queryKey: ['MyReview', itemId, user?.Id] }),
                queryClient.invalidateQueries({ queryKey: ['MyReviews', user?.Id] }),
                queryClient.invalidateQueries({ queryKey: ['TopRatedItems'] })
            ]);
        }
    });
};
