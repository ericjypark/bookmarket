import { cn } from '../utils/cn';

export const AnimatedUnderlinedText = ({ children }: { children: React.ReactNode }) => {
  return (
    <span
      className={cn(
        'relative flex cursor-pointer px-2 py-1 align-middle hover:text-neutral-800 dark:hover:text-neutral-200',
        'underline decoration-transparent underline-offset-2 transition-all duration-300 hover:decoration-current',
      )}
    >
      {children}
    </span>
  );
};
