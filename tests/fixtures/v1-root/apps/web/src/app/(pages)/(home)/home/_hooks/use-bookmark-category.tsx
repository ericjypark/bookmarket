import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { updateBookmarkCategory } from '~/app/_common/actions/bookmark.action';
import { withDeploymentCheck } from '~/app/_common/utils/deployment-mismatch';
import { type Category } from '~/app/_common/interfaces/category.interface';
import { trackCategoryEvent } from '~/app/_common/utils/analytics';
import { categoriesQuery } from '~/app/_common/state/query/category.query';

export const useBookmarkCategory = ({
  selectedCategory,
  bookmarkId,
}: {
  selectedCategory?: string;
  bookmarkId: string;
}) => {
  const router = useRouter();

  const { data: categories } = useQuery(categoriesQuery());

  const handleCategoryClick = async (category: Category) => {
    toast.promise(
      async () => {
        if (category.name === selectedCategory) {
          await withDeploymentCheck(updateBookmarkCategory({
            id: bookmarkId,
            categoryId: undefined,
          }));
        } else {
          trackCategoryEvent.assign(category.name);
          await withDeploymentCheck(updateBookmarkCategory({
            id: bookmarkId,
            categoryId: category.id,
          }));
        }
      },
      {
        loading: 'Updating category...',
        success: 'Category updated!',
        error: 'Failed to update category',
        finally: () => {
          router.refresh();
        },
      },
    );
  };

  return { handleCategoryClick, categories };
};
