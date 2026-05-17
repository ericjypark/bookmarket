import { CheckIcon } from 'lucide-react';
import { type Category } from '~/app/_common/interfaces/category.interface';
import { Button } from '~/app/_core/components/button';
import { DrawerContent, DrawerHeader, DrawerTitle } from '~/app/_core/components/drawer';
import { cn } from '~/app/_core/utils/cn';

export const CategoryDrawerContent = ({
  categories,
  activeTab,
  handleClick,
  setIsMobileDrawerOpen,
}: {
  categories: Category[];
  activeTab?: Category;
  handleClick: (category: Category) => void;
  setIsMobileDrawerOpen: (open: boolean) => void;
}) => {
  return (
    <DrawerContent>
      <DrawerHeader>
        <DrawerTitle>Categories</DrawerTitle>
      </DrawerHeader>
      <hr className='my-2' />
      <div className='flex flex-col gap-2 pb-4'>
        {categories.map(category => (
          <Button
            key={category.id}
            variant='ghost'
            className={cn('h-12 justify-between', activeTab?.name === category.name && 'bg-muted')}
            onClick={() => {
              handleClick(category);
              setIsMobileDrawerOpen(false);
            }}
          >
            {category.name}
            {activeTab?.name === category.name && <CheckIcon size={16} />}
          </Button>
        ))}
      </div>
    </DrawerContent>
  );
};
