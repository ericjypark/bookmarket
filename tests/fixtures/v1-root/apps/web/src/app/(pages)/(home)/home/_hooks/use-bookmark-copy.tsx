import { useCopyToClipboard } from '@uidotdev/usehooks';
import { toast } from 'sonner';

export const useBookmarkCopy = () => {
  const [_, copyToClipboard] = useCopyToClipboard();

  const handleCopy = async (url: string) => {
    try {
      await copyToClipboard(url);
      toast.success('Copied to clipboard');
    } catch (error) {
      console.error(error);
      toast.error('Failed to copy to clipboard');
    }
  };

  return {
    handleCopy,
  };
};
