'use client';
import React from 'react';
import { useAppState } from '~/app/(pages)/(home)/home/_state/store/use-app-state-store';
import { Dialog } from '~/app/_core/components/dialog';
import { cn } from '~/app/_core/utils/cn';

export const ModalProvider = () => {
  const { modalMap } = useAppState();

  const modals = React.useMemo(() => Array.from(modalMap.entries()), [modalMap]);

  return (
    <Dialog open={modals.length > 0}>
      {modals.map(([id, modal]) => (
        <div
          key={id}
          className={cn('fixed left-0 top-0 z-[9999] flex size-full items-center justify-center bg-black/50')}
        >
          {modal}
        </div>
      ))}
    </Dialog>
  );
};
