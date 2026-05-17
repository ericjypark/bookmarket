'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardIcon, KeyRoundIcon, Loader2Icon, Trash2Icon } from 'lucide-react';
import React from 'react';
import { toast } from 'sonner';
import { createRaycastApiToken, listApiTokens, revokeApiToken } from '../actions/api-token.action';
import { type ApiToken } from '../interfaces/api-token.interface';
import { Button } from '~/app/_core/components/button';
import { Input } from '~/app/_core/components/input';
import { cn } from '~/app/_core/utils/cn';

const apiTokenQueryKey = ['api-tokens'];

const formatDate = (value?: string | null) => {
  if (!value) return 'Never used';

  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(value));
  } catch {
    return 'Unknown';
  }
};

const tokenScopeLabel = (scopes: string[]) =>
  scopes
    .map(scope => scope.replace('bookmarks:', ''))
    .join(', ')
    .replace('read, write', 'read/write');

const TokenRow = ({
  token,
  isRevoking,
  onRevoke,
}: {
  token: ApiToken;
  isRevoking: boolean;
  onRevoke: (id: string) => void;
}) => (
  <div className='flex items-center justify-between gap-3 border-t py-3 first:border-t-0'>
    <div className='min-w-0'>
      <p className='truncate text-sm font-medium'>{token.name}</p>
      <div className='mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground'>
        <span className='font-mono'>{token.tokenPrefix}...</span>
        <span>{tokenScopeLabel(token.scopes)}</span>
        <span>{token.lastUsedAt ? `Last used ${formatDate(token.lastUsedAt)}` : 'Never used'}</span>
      </div>
    </div>
    <Button
      aria-label={`Revoke ${token.name} token`}
      className='shrink-0'
      disabled={isRevoking}
      onClick={() => onRevoke(token.id)}
      size='icon'
      type='button'
      variant='ghost'
    >
      {isRevoking ? <Loader2Icon className='animate-spin' /> : <Trash2Icon />}
    </Button>
  </div>
);

export const ApiTokenSettings = () => {
  const queryClient = useQueryClient();
  const [createdToken, setCreatedToken] = React.useState('');

  const {
    data: tokens = [],
    isError,
    isLoading,
  } = useQuery({
    queryKey: apiTokenQueryKey,
    queryFn: listApiTokens,
  });

  const createMutation = useMutation({
    mutationFn: createRaycastApiToken,
    onSuccess: response => {
      setCreatedToken(response.token);
      queryClient.setQueryData<ApiToken[]>(apiTokenQueryKey, current => [
        response.tokenMetadata,
        ...(current ?? []).filter(token => token.id !== response.tokenMetadata.id),
      ]);
      toast.success('Raycast token created');
    },
    onError: error => {
      toast.error(error.message);
    },
  });

  const revokeMutation = useMutation({
    mutationFn: revokeApiToken,
    onSuccess: (_, id) => {
      queryClient.setQueryData<ApiToken[]>(apiTokenQueryKey, current => (current ?? []).filter(token => token.id !== id));
      toast.success('Token revoked');
    },
    onError: error => {
      toast.error(error.message);
    },
  });

  const handleCreateClick = React.useCallback(() => {
    createMutation.mutate();
  }, [createMutation]);

  const handleCopyClick = React.useCallback(async () => {
    if (!createdToken) return;

    try {
      await navigator.clipboard.writeText(createdToken);
      toast.success('Token copied');
    } catch {
      toast.error('Failed to copy token');
    }
  }, [createdToken]);

  return (
    <section className='border-t px-6 py-5'>
      <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
        <div>
          <h2 className='text-sm font-semibold'>API tokens</h2>
          <p className='mt-1 text-xs text-muted-foreground'>Raycast needs bookmark read/write access.</p>
        </div>
        <Button
          className='w-full sm:w-auto'
          disabled={createMutation.isPending}
          onClick={handleCreateClick}
          size='sm'
          type='button'
          variant='outline'
        >
          {createMutation.isPending ? <Loader2Icon className='animate-spin' /> : <KeyRoundIcon />}
          Create Raycast token
        </Button>
      </div>

      {createdToken && (
        <div className='mt-4 rounded-md border bg-muted/20 p-3'>
          <div className='flex items-center justify-between gap-3'>
            <p className='text-xs font-medium'>New token</p>
            <p className='text-xs text-muted-foreground'>Shown once</p>
          </div>
          <div className='mt-2 flex gap-2'>
            <Input className='font-mono text-xs' readOnly type='text' value={createdToken} />
            <Button aria-label='Copy API token' onClick={handleCopyClick} size='icon' type='button' variant='outline'>
              <ClipboardIcon />
            </Button>
          </div>
        </div>
      )}

      <div className={cn('mt-4', tokens.length > 0 && 'border-b')}>
        {isLoading && (
          <div className='flex items-center gap-2 py-3 text-sm text-muted-foreground'>
            <Loader2Icon className='size-4 animate-spin' />
            Loading tokens
          </div>
        )}
        {isError && <p className='py-3 text-sm text-red-500'>Could not load API tokens</p>}
        {!isLoading && !isError && tokens.length === 0 && (
          <p className='py-3 text-sm text-muted-foreground'>No API tokens yet</p>
        )}
        {tokens.map(token => (
          <TokenRow
            key={token.id}
            token={token}
            isRevoking={revokeMutation.isPending && revokeMutation.variables === token.id}
            onRevoke={revokeMutation.mutate}
          />
        ))}
      </div>
    </section>
  );
};
