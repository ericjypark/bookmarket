'use client';
import * as HoverCardPrimitive from '@radix-ui/react-hover-card';
import { AnimatePresence, motion } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';
import { encode } from 'qss';
import React, { useState } from 'react';
import { cn } from '../utils/cn';

type LinkPreviewProps = {
  children: React.ReactNode;
  url: string;
  className?: string;
  width?: number;
  height?: number;
  quality?: number;
  layout?: string;
  isDisabled?: boolean;
} & ({ isStatic: true; imageSrc: string } | { isStatic?: false; imageSrc?: never });

const getMicrolinkSrc = (url: string) => {
  const params = encode({
    url,
    screenshot: true,
    meta: false,
    embed: 'screenshot.url',
    colorScheme: 'light',
    'viewport.isMobile': false,
    'viewport.deviceScaleFactor': 1,
    'viewport.width': 1280,
    'viewport.height': 720,
  });
  return `https://api.microlink.io/?${params}`;
};

export const LinkPreview: React.FC<LinkPreviewProps> = ({
  children,
  url,
  className,
  width = 160,
  height = 90,
  quality = 50,
  layout = 'fixed',
  isStatic = false,
  imageSrc = '',
  isDisabled = false,
}) => {
  const [isOpen, setOpen] = useState(false);

  if (isDisabled) {
    return children;
  }

  return (
    <HoverCardPrimitive.Root openDelay={50} closeDelay={50} onOpenChange={setOpen}>
      <HoverCardPrimitive.Trigger className={cn('text-black dark:text-white', className)} href={url} target='_blank'>
        {children}
      </HoverCardPrimitive.Trigger>
      <HoverCardPrimitive.Content
        className='z-50 hidden [transform-origin:var(--radix-hover-card-content-transform-origin)] lg:block'
        side='left'
        align='center'
        sideOffset={10}
        collisionPadding={20}
      >
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, x: 20, scale: 0.4 }}
              animate={{
                opacity: 1,
                x: 0,
                scale: 1,
                transition: { type: 'spring', stiffness: 260, damping: 20 },
              }}
              exit={{ opacity: 0, x: 20, scale: 0.6 }}
              className='rounded-md shadow-md'
            >
              <Link
                target='_blank'
                href={url}
                className='block rounded-lg border-2 border-transparent bg-white p-1 shadow-sm'
                style={{ fontSize: 0 }}
              >
                <Image
                  src={isStatic ? imageSrc : getMicrolinkSrc(url)}
                  width={width}
                  height={height}
                  quality={quality}
                  layout={layout}
                  priority={true}
                  className='rounded-md'
                  alt='preview image'
                  style={{
                    maxWidth: '100%',
                    height: 'auto',
                  }}
                />
              </Link>
            </motion.div>
          )}
        </AnimatePresence>
      </HoverCardPrimitive.Content>
    </HoverCardPrimitive.Root>
  );
};
