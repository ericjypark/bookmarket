import React from 'react';
import { useShortcut } from '~/app/_common/hooks/use-shortcut';
import { Input } from '~/app/_core/components/input';
import { cn } from '~/app/_core/utils/cn';

interface UrlInputProps {
  isValidUrl: boolean;
  isDisabled: boolean;
}

export function UrlInput({ isValidUrl, isDisabled }: UrlInputProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);

  useShortcut('Slash', () => {
    inputRef.current?.focus();
  });

  useShortcut('Escape', () => {
    inputRef.current?.blur();
  });

  return (
    <div className='relative'>
      <Input
        ref={inputRef}
        name='url'
        className={cn('pl-8', !isValidUrl && 'border-red-500 focus-visible:ring-0')}
        placeholder='Paste a link to add a bookmark'
        disabled={isDisabled}
      />
    </div>
  );
}
