import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as reviewsApi from 'apis/reviewsApi';
import type { UpdateReviewRequest } from 'apis/reviewsApi';
import { useApi } from 'hooks/useApi';

export const useGetItemRatingSummary = (itemId?: string | null) => {
    const { user } = useApi();

    return useQuery({
        queryKey: ['ReviewSummary', itemId],
        queryFn: () => reviewsApi.getSummary(itemId!),
        enabled: !!user?.Id && !!itemId
    });
};

export const useGetItemReviews = (itemId?: string | null) => {
    const { user } = useApi();

    return useQuery({
        queryKey: ['Reviews', itemId],
        queryFn: () => reviewsApi.getReviews(itemId!),
        enabled: !!user?.Id && !!itemId
    });
};

export const useGetMyReview = (itemId?: string | null) => {
    const { user } = useApi();

    return useQuery({
        queryKey: ['MyReview', itemId, user?.Id],
        queryFn: () => reviewsApi.getMyReview(itemId!),
        enabled: !!user?.Id && !!itemId
    });
};

export const useGetMyReviews = () => {
    const { user } = useApi();

    return useQuery({
        queryKey: ['MyReviews', user?.Id],
        queryFn: () => reviewsApi.getMyReviews(),
        enabled: !!user?.Id
    });
};

export const useGetAllReviews = () => {
    const { user } = useApi();

    return useQuery({
        queryKey: ['AllReviews', user?.Id],
        queryFn: () => reviewsApi.getAllReviews(),
        enabled: !!user?.Id && !!user?.Policy?.IsAdministrator
    });
};

export const useGetTopRatedItems = (minRatingCount = 1, limit = 50) => {
    const { user } = useApi();

    return useQuery({
        queryKey: ['TopRatedItems', minRatingCount, limit],
        queryFn: () => reviewsApi.getTopRated(minRatingCount, limit),
        enabled: !!user?.Id
    });
};

export const useUpsertReview = (itemId: string) => {
    const { user } = useApi();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (request: UpdateReviewRequest) => reviewsApi.upsertReview(itemId, request),
        onSuccess: async () => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['ReviewSummary', itemId] }),
                queryClient.invalidateQueries({ queryKey: ['Reviews', itemId] }),
                queryClient.invalidateQueries({ queryKey: ['MyReview', itemId, user?.Id] }),
                queryClient.invalidateQueries({ queryKey: ['MyReviews', user?.Id] }),
                queryClient.invalidateQueries({ queryKey: ['AllReviews', user?.Id] }),
                queryClient.invalidateQueries({ queryKey: ['TopRatedItems'] })
            ]);
        }
    });
};

export const useDeleteReview = (itemId: string) => {
    const { user } = useApi();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: () => reviewsApi.deleteReview(itemId),
        onSuccess: async () => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['ReviewSummary', itemId] }),
                queryClient.invalidateQueries({ queryKey: ['Reviews', itemId] }),
                queryClient.invalidateQueries({ queryKey: ['MyReview', itemId, user?.Id] }),
                queryClient.invalidateQueries({ queryKey: ['MyReviews', user?.Id] }),
                queryClient.invalidateQueries({ queryKey: ['AllReviews', user?.Id] }),
                queryClient.invalidateQueries({ queryKey: ['TopRatedItems'] })
            ]);
        }
    });
};

export const useDeleteReviewAsAdmin = (itemId: string, userId: string) => {
    const { user } = useApi();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: () => reviewsApi.deleteReviewAsAdmin(itemId, userId),
        onSuccess: async () => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['ReviewSummary', itemId] }),
                queryClient.invalidateQueries({ queryKey: ['Reviews', itemId] }),
                queryClient.invalidateQueries({ queryKey: ['MyReview', itemId, userId] }),
                queryClient.invalidateQueries({ queryKey: ['MyReviews', userId] }),
                queryClient.invalidateQueries({ queryKey: ['AllReviews', user?.Id] }),
                queryClient.invalidateQueries({ queryKey: ['TopRatedItems'] })
            ]);
        }
    });
};
