'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { FolderIcon } from 'lucide-react';
import { parseAsString, useQueryState } from 'nuqs';

import React from 'react';
import { CategoryDrawerContent } from '~/app/(pages)/(home)/home/_components/category-drawer-content';
import { Drawer, DrawerTrigger } from '~/app/_core/components/drawer';
import { type Category } from '../interfaces/category.interface';
import { trackCategoryEvent } from '../utils/analytics';
import { AddCategoryButton } from './add-category-button';
import { TextMorph } from './text-morph';

export const AnimatedTab = ({ categories, isShared }: { categories: Category[]; isShared?: boolean }) => {
  const [category, setCategory] = useQueryState('c', parseAsString);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = React.useState(false);
  const activeTab = categories.find(tab => tab.name === category);

  const handleCategoryClick = React.useCallback(
    (category: Category) => {
      if (activeTab?.name === category.name) {
        setCategory(null);
        return;
      }
      trackCategoryEvent.filter(category.name);
      setCategory(category.name);
    },
    [activeTab?.name, setCategory],
  );

  return (
    <>
      {/* Desktop */}
      <div className='absolute left-1/2 hidden h-8 -translate-x-1/2 gap-2 bg-background sm:flex'>
        {categories.map(category => (
          <button
            className='relative cursor-pointer rounded-full px-3 py-1.5 text-sm font-medium'
            key={category.id}
            onClick={() => handleCategoryClick(category)}
            style={{
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <AnimatePresence>
              {activeTab?.name === category.name && (
                <motion.span
                  className='absolute inset-0 bg-black'
                  layoutId='active-category'
                  style={{ borderRadius: 8 }}
                  transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                />
              )}
            </AnimatePresence>
            <p className='relative z-10 max-w-20 truncate text-white mix-blend-exclusion transition-opacity duration-300'>
              {category.name}
            </p>
          </button>
        ))}
        {!isShared && categories.length <= 5 && <AddCategoryButton />}
      </div>

      {/* Mobile */}
      <div className='flex w-full flex-col items-center justify-center gap-2 bg-background sm:hidden'>
        <Drawer open={isMobileDrawerOpen} onOpenChange={setIsMobileDrawerOpen}>
          <DrawerTrigger asChild>
            <div className='flex w-fit max-w-32 items-center justify-center gap-2 rounded-xl bg-black px-4 py-1.5 text-sm font-medium text-white'>
              <FolderIcon size={16} />
              <TextMorph className='truncate text-sm font-medium'>{activeTab?.name ?? 'All'}</TextMorph>
            </div>
          </DrawerTrigger>
          <CategoryDrawerContent
            categories={categories}
            activeTab={activeTab}
            handleClick={handleCategoryClick}
            setIsMobileDrawerOpen={setIsMobileDrawerOpen}
          />
        </Drawer>
      </div>
    </>
  );
};
