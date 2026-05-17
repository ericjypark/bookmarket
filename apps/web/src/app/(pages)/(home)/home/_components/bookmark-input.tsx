'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { parseAsString, useQueryState } from 'nuqs';
import React from 'react';
import { type Category } from '~/app/_common/interfaces/category.interface';
import { type Bookmark } from '~/app/_common/interfaces/bookmark.interface';
import { categoriesQuery } from '~/app/_common/state/query/category.query';
import { bookmarksQuery } from '~/app/_common/state/query/bookmark.query';
import BlurFade from '~/app/_core/components/blur-fade';
import { ProgressiveBlur } from '~/app/_core/components/progressive-blur';
import { trackBookmarkEvent } from '~/app/_common/utils/analytics';
import { withDeploymentCheck } from '~/app/_common/utils/deployment-mismatch';
import { isValidBookmarkUrl, normalizeBookmarkUrl } from '~/app/_common/utils/url';
import { createBookmarkAction, type CreateBookmarkState } from '../_actions/create-bookmark.action';
import { UrlInput } from './url-input';

export function BookmarkInput() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [category] = useQueryState('c', parseAsString);
  const formRef = React.useRef<HTMLFormElement>(null);
  const { data: categories = [] } = useQuery(categoriesQuery());
  const [state, setState] = React.useState<CreateBookmarkState>({
    error: '',
    success: '',
  });
  const [isPending, setIsPending] = React.useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isPending) return;

    const formData = new FormData(event.currentTarget);
    const url = formData.get('url') as string;
    if (!url) {
      setState(previousState => ({ error: 'URL is required', success: previousState.success }));
      return;
    }

    const normalizedUrl = normalizeBookmarkUrl(url);
    if (!isValidBookmarkUrl(normalizedUrl)) {
      setState(previousState => ({ error: 'Invalid URL', success: previousState.success }));
      return;
    }

    const optimisticBookmark = buildOptimisticBookmark(normalizedUrl, category, categories);

    try {
      setIsPending(true);
      setState({ error: '', success: '' });
      trackBookmarkEvent.createStart(url);
      queryClient.setQueryData(bookmarksQuery().queryKey, (oldBookmarks: Bookmark[] | undefined) => [
        optimisticBookmark,
        ...(oldBookmarks ?? []),
      ]);

      const result = await withDeploymentCheck(createBookmarkAction(state, formData, category ?? undefined));
      setState(result);

      if (result.success) {
        trackBookmarkEvent.createSuccess(url);
        if (result.bookmark) {
          queryClient.setQueryData(bookmarksQuery().queryKey, (oldBookmarks: Bookmark[] | undefined) =>
            (oldBookmarks ?? []).map(bookmark => (bookmark.id === optimisticBookmark.id ? result.bookmark! : bookmark)),
          );
        }
        formRef.current?.reset();
        void queryClient.invalidateQueries({ queryKey: bookmarksQuery().queryKey });
        router.refresh();
      } else if (result.error) {
        trackBookmarkEvent.createError(result.error);
        queryClient.setQueryData(bookmarksQuery().queryKey, (oldBookmarks: Bookmark[] | undefined) =>
          (oldBookmarks ?? []).filter(bookmark => bookmark.id !== optimisticBookmark.id),
        );
      }
    } catch (error) {
      queryClient.setQueryData(bookmarksQuery().queryKey, (oldBookmarks: Bookmark[] | undefined) =>
        (oldBookmarks ?? []).filter(bookmark => bookmark.id !== optimisticBookmark.id),
      );
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setState({ error: errorMessage, success: '' });
      trackBookmarkEvent.createError(errorMessage);
    } finally {
      setIsPending(false);
    }
  };

  const isValidUrl = state.error === '';

  return (
    <div className='sticky top-14 z-10 w-full bg-background pt-1'>
      <ProgressiveBlur className='pointer-events-none absolute -bottom-10 left-0 z-0 h-14 w-full' direction='top' />
      <BlurFade duration={0.2} delay={0.1} className='z-20'>
        <form ref={formRef} onSubmit={handleSubmit}>
          <div className='relative'>
            <Search className='absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground' />
            <UrlInput isValidUrl={isValidUrl} isDisabled={isPending} />
            {isPending && <Loader2 className='absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-muted-foreground' />}
            {state.error && <p className='mt-1 text-sm text-red-500'>{state.error}</p>}
          </div>
        </form>
      </BlurFade>
    </div>
  );
}

const buildOptimisticBookmark = (url: string, categoryName: string | null, categories: Category[]): Bookmark => {
  const now = new Date();
  const category = categoryName ? categories.find(item => item.name === categoryName) : undefined;

  return {
    id: `optimistic-${crypto.randomUUID()}`,
    url,
    title: url,
    metadataStatus: 'PENDING',
    metadataUpdatedAt: now,
    createdAt: now,
    updatedAt: now,
    category,
    isOptimistic: true,
  };
};
