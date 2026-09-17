import React, { type FC, useEffect, useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Rating from '@mui/material/Rating';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import DeleteIcon from '@mui/icons-material/Delete';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';

import Page from 'components/Page';
import Loading from 'components/loading/LoadingComponent';
import { appRouter } from 'components/router/appRouter';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import { useApi } from 'hooks/useApi';
import {
    useGetTopRatedItems,
    useGetMyReviews,
    useGetAllReviews,
    useDeleteReview,
    useDeleteReviewAsAdmin
} from 'hooks/api/reviewsHooks/useReviews';
import type { ReviewDto } from 'apis/reviewsApi';

const useItemsByIds = (itemIds: string[]) => {
    const { user } = useApi();
    const [ items, setItems ] = useState<Record<string, BaseItemDto>>({});
    const itemIdsKey = itemIds.join(',');

    useEffect(() => {
        if (!user?.Id || !itemIdsKey) {
            setItems({});
            return;
        }

        const apiClient = ServerConnections.currentApiClient();
        if (!apiClient) {
            return;
        }

        apiClient.getItems(user.Id, { Ids: itemIdsKey }).then(result => {
            const map: Record<string, BaseItemDto> = {};
            (result.Items ?? []).forEach(item => {
                if (item.Id) {
                    map[item.Id] = item;
                }
            });
            setItems(map);
        }).catch(() => {
            setItems({});
        });
    }, [ user?.Id, itemIdsKey ]);

    return items;
};

function openItem(item?: BaseItemDto) {
    if (item) {
        appRouter.showItem(item);
    }
}

const ReviewRow: FC<{ review: ReviewDto; item?: BaseItemDto }> = ({ review, item }) => {
    const { mutate: deleteReview, isPending } = useDeleteReview(review.ItemId);

    return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 1.5, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            <Box
                sx={{ flexGrow: 1, cursor: item ? 'pointer' : 'default' }}
                // eslint-disable-next-line react/jsx-no-bind
                onClick={() => openItem(item)}
            >
                <Typography variant='subtitle1'>{item?.Name ?? review.ItemId}</Typography>
                {review.Rating != null && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Rating value={review.Rating / 2} precision={0.5} readOnly size='small' />
                        <Typography variant='caption' color='text.secondary'>{review.Rating.toFixed(2)}/10</Typography>
                    </Box>
                )}
                {review.Comment && (
                    <Typography variant='body2' color='text.secondary'>{review.Comment}</Typography>
                )}
            </Box>
            <IconButton
                // eslint-disable-next-line react/jsx-no-bind
                onClick={() => deleteReview()}
                disabled={isPending}
                aria-label='Delete review'
            >
                <DeleteIcon />
            </IconButton>
        </Box>
    );
};

const AdminReviewRow: FC<{ review: ReviewDto; item?: BaseItemDto }> = ({ review, item }) => {
    const { mutate: deleteReview, isPending } = useDeleteReviewAsAdmin(review.ItemId, review.UserId);

    return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 1.5, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            <Box
                sx={{ flexGrow: 1, cursor: item ? 'pointer' : 'default' }}
                // eslint-disable-next-line react/jsx-no-bind
                onClick={() => openItem(item)}
            >
                <Typography variant='subtitle1'>{item?.Name ?? review.ItemId}</Typography>
                <Typography variant='body2' color='text.secondary'>{review.UserName ?? review.UserId}</Typography>
                {review.Rating != null && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Rating value={review.Rating / 2} precision={0.5} readOnly size='small' />
                        <Typography variant='caption' color='text.secondary'>{review.Rating.toFixed(2)}/10</Typography>
                    </Box>
                )}
                {review.Comment && (
                    <Typography variant='body2' color='text.secondary'>{review.Comment}</Typography>
                )}
            </Box>
            <IconButton
                // eslint-disable-next-line react/jsx-no-bind
                onClick={() => deleteReview()}
                disabled={isPending}
                aria-label='Delete review'
            >
                <DeleteIcon />
            </IconButton>
        </Box>
    );
};

const TopRatedRow: FC<{ itemId: string; averageRating?: number; ratingCount: number; item?: BaseItemDto }> = ({
    averageRating,
    ratingCount,
    item
}) => {
    return (
        <Box
            sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 1.5, borderBottom: '1px solid rgba(255,255,255,0.1)', cursor: item ? 'pointer' : 'default' }}
            // eslint-disable-next-line react/jsx-no-bind
            onClick={() => openItem(item)}
        >
            <Typography variant='subtitle1' sx={{ flexGrow: 1 }}>{item?.Name ?? 'Unknown item'}</Typography>
            {averageRating != null && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Rating value={averageRating / 2} precision={0.5} readOnly size='small' />
                    <Typography variant='caption' color='text.secondary'>{averageRating.toFixed(2)}/10</Typography>
                </Box>
            )}
            <Typography variant='body2' color='text.secondary'>
                {ratingCount} rating{ratingCount === 1 ? '' : 's'}
            </Typography>
        </Box>
    );
};

const RatingsPage = () => {
    const { user } = useApi();
    const isAdmin = !!user?.Policy?.IsAdministrator;

    const { data: topRated, isLoading: isTopRatedLoading } = useGetTopRatedItems(1, 50);
    const { data: myReviews, isLoading: isMyReviewsLoading } = useGetMyReviews();
    const { data: allReviews, isLoading: isAllReviewsLoading } = useGetAllReviews();

    const allItemIds = useMemo(() => {
        const ids = new Set<string>();
        topRated?.forEach(s => {
            ids.add(s.ItemId);
        });
        myReviews?.forEach(r => {
            ids.add(r.ItemId);
        });
        allReviews?.forEach(r => {
            ids.add(r.ItemId);
        });
        return Array.from(ids);
    }, [ topRated, myReviews, allReviews ]);

    const itemsById = useItemsByIds(allItemIds);

    const isLoading = isTopRatedLoading || isMyReviewsLoading || (isAdmin && isAllReviewsLoading);

    return (
        <Page
            id='ratingsPage'
            title='Ratings'
            className='mainAnimatedPage libraryPage'
        >
            <Box className='padded-left padded-right padded-bottom-page'>
                <Typography variant='h1' sx={{ fontSize: '1.6em', mb: 2 }}>Ratings</Typography>

                {isLoading && <Loading />}

                {!isLoading && (
                    <>
                        <Typography variant='h2' sx={{ fontSize: '1.2em', mt: 3, mb: 1 }}>My Reviews</Typography>
                        {(!myReviews || myReviews.length === 0) && (
                            <Typography variant='body2' color='text.secondary'>
                                You have not rated or reviewed anything yet. Right click a movie, series, season, or
                                episode and choose &quot;Rate &amp; Review&quot; to get started.
                            </Typography>
                        )}
                        {myReviews?.map(review => (
                            <ReviewRow key={review.ItemId} review={review} item={itemsById[review.ItemId]} />
                        ))}

                        <Typography variant='h2' sx={{ fontSize: '1.2em', mt: 4, mb: 1 }}>Top Rated</Typography>
                        {(!topRated || topRated.length === 0) && (
                            <Typography variant='body2' color='text.secondary'>
                                Nothing has been rated yet.
                            </Typography>
                        )}
                        {topRated?.map(summary => (
                            <TopRatedRow
                                key={summary.ItemId}
                                itemId={summary.ItemId}
                                averageRating={summary.AverageRating}
                                ratingCount={summary.RatingCount}
                                item={itemsById[summary.ItemId]}
                            />
                        ))}

                        {isAdmin && (
                            <>
                                <Typography variant='h2' sx={{ fontSize: '1.2em', mt: 4, mb: 1 }}>All Reviews (Admin)</Typography>
                                {(!allReviews || allReviews.length === 0) && (
                                    <Typography variant='body2' color='text.secondary'>
                                        No one has rated or reviewed anything yet.
                                    </Typography>
                                )}
                                {allReviews?.map(review => (
                                    <AdminReviewRow
                                        key={`${review.ItemId}-${review.UserId}`}
                                        review={review}
                                        item={itemsById[review.ItemId]}
                                    />
                                ))}
                            </>
                        )}
                    </>
                )}
            </Box>
        </Page>
    );
};

export default RatingsPage;
