import React, { type FC } from 'react';
import classNames from 'classnames';
import RateReviewIcon from '@mui/icons-material/RateReview';
import Box from '@mui/material/Box';

import { useGetItemRatingSummary } from 'hooks/api/reviewsHooks/useReviews';

interface UserRatingMediaInfoProps {
    className?: string;
    itemId: string;
}

const UserRatingMediaInfo: FC<UserRatingMediaInfoProps> = ({ className, itemId }) => {
    const { data: summary } = useGetItemRatingSummary(itemId);

    if (!summary?.AverageRating) {
        return null;
    }

    const cssClass = classNames(
        'mediaInfoItem',
        'userRatingContainer',
        className
    );

    return (
        <Box className={cssClass} title={`${summary.RatingCount} rating${summary.RatingCount === 1 ? '' : 's'}`}>
            <RateReviewIcon fontSize={'small'} />
            {summary.AverageRating.toFixed(1)}
            {summary.RatingCount > 0 && (
                <Box component={'span'} className={'userRatingCount'}>
                    {` (${summary.RatingCount})`}
                </Box>
            )}
        </Box>
    );
};

export default UserRatingMediaInfo;
