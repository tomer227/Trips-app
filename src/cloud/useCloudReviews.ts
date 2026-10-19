import { useCallback, useEffect, useState } from 'react';
import type { Review, ReviewTag } from '../community';
import { useAuth } from './AuthContext';
import { CloudError, cloudErrorMessages, type CloudReview, type NewReview } from './types';

/** A shared review as the rest of the app understands reviews, plus who wrote it. */
export function toAppReview(r: CloudReview, myId: string | undefined): Review {
  return {
    id: r.id,
    placeId: r.placeId,
    stars: r.stars,
    text: r.text,
    visited: r.visited,
    costUsd: r.costUsd,
    tags: r.tags as ReviewTag[],
    createdAt: r.createdAt,
    author: r.author,
    remote: true,
    mine: !!myId && r.userId === myId,
  };
}

export const messageOf = (e: unknown): string => cloudErrorMessages[e instanceof CloudError ? e.code : 'unknown'];

/**
 * Community reviews for one place. Empty (and `enabled` false) when accounts are not configured, so
 * the app behaves exactly as before.
 */
export function useCloudReviews(placeId: string) {
  const { backend, user, status } = useAuth();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const enabled = !!backend;
  const myId = user?.id;

  const refresh = useCallback(async () => {
    if (!backend) return;
    setLoading(true);
    try {
      const list = await backend.listReviews(placeId);
      setReviews(list.map((r) => toAppReview(r, myId)));
      setError(null);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setLoading(false);
    }
  }, [backend, placeId, myId]);

  useEffect(() => {
    setReviews([]);
    if (status !== 'loading') void refresh();
  }, [refresh, status]);

  const save = useCallback(
    async (review: Omit<NewReview, 'placeId'>): Promise<string | null> => {
      if (!backend) return cloudErrorMessages.not_signed_in;
      try {
        await backend.saveReview({ ...review, placeId });
        await refresh();
        return null;
      } catch (e) {
        return messageOf(e);
      }
    },
    [backend, placeId, refresh],
  );

  const remove = useCallback(
    async (id: string): Promise<string | null> => {
      try {
        await backend?.deleteReview(id);
        await refresh();
        return null;
      } catch (e) {
        return messageOf(e);
      }
    },
    [backend, refresh],
  );

  const report = useCallback(
    async (id: string, reason: string): Promise<string | null> => {
      try {
        await backend?.reportReview(id, reason);
        return null;
      } catch (e) {
        return messageOf(e);
      }
    },
    [backend],
  );

  return { enabled, signedIn: status === 'in', reviews, loading, error, refresh, save, remove, report };
}
