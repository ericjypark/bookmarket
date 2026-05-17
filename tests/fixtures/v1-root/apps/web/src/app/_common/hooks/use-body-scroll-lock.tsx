import React from 'react';

export const useBodyScrollLock = ({ isDisabled }: { isDisabled?: boolean }) => {
  React.useEffect(() => {
    const body = document.body;
    if (isDisabled) {
      body.style.overflow = 'visible';
    } else {
      body.style.overflow = 'hidden';
    }

    return () => {
      body.style.overflow = 'visible';
    };
  }, [isDisabled]);
};
