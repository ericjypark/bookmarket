'use client';

import { FolderIcon } from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '~/app/_core/components/context-menu';
import { type Bookmark } from '~/app/_common/interfaces/bookmark.interface';
import { BookmarkContextMenuCategoryList } from './bookmark-context-menu-category-list';
import { useBookmarkContext } from '../_hooks/use-bookmark-context';

export const BookmarkContextMenu = ({ bookmark }: { bookmark: Bookmark }) => {
  const { menuItems } = useBookmarkContext({ bookmark });

  return (
    <ContextMenuContent>
      {menuItems.map(item => (
        <ContextMenuItem
          key={item.label}
          className='cursor-pointer font-medium text-muted-foreground'
          onClick={item.onClick}
          disabled={item.disabled}
        >
          <item.icon className='mr-3 h-4 w-4' />
          {item.label}
        </ContextMenuItem>
      ))}
      <ContextMenuSeparator />
      <ContextMenuSub>
        <ContextMenuSubTrigger className='cursor-pointer font-medium text-muted-foreground'>
          <FolderIcon className='mr-2 h-4 w-4' />
          Category
        </ContextMenuSubTrigger>
        <ContextMenuSubContent className='w-fit text-muted-foreground'>
          <BookmarkContextMenuCategoryList selectedCategory={bookmark.category?.name} bookmarkId={bookmark.id} />
        </ContextMenuSubContent>
      </ContextMenuSub>
    </ContextMenuContent>
  );
};

export const BookmarkContextMenuProvider = ContextMenu;

export function BookmarkContextMenuTrigger({ children }: { children: React.ReactNode }) {
  return <ContextMenuTrigger>{children}</ContextMenuTrigger>;
}
