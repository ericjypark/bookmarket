import React from 'react';
import { ContextMenuCheckboxItem } from '~/app/_core/components/context-menu';
import { useBookmarkCategory } from '../_hooks/use-bookmark-category';

export const BookmarkContextMenuCategoryList = ({
  selectedCategory,
  bookmarkId,
}: {
  selectedCategory?: string;
  bookmarkId: string;
}) => {
  const { categories, handleCategoryClick } = useBookmarkCategory({
    selectedCategory,
    bookmarkId,
  });

  return categories?.map(category => (
    <ContextMenuCheckboxItem
      key={category.id}
      checked={category.name === selectedCategory}
      onCheckedChange={() => handleCategoryClick(category)}
    >
      {category.name}
    </ContextMenuCheckboxItem>
  ));
};
