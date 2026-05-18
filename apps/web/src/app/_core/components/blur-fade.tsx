'use client';

import { useRef } from 'react';
import { motion, useInView, type UseInViewOptions, type Variants } from 'motion/react';

type MarginType = UseInViewOptions['margin'];

interface BlurFadeProps {
  children: React.ReactNode;
  className?: string;
  variant?: {
    hidden: { y: number };
    visible: { y: number };
  };
  duration?: number;
  delay?: number;
  yOffset?: number;
  inView?: boolean;
  inViewMargin?: MarginType;
  blur?: string;
}

export default function BlurFade({
  children,
  className,
  variant,
  duration = 0.2,
  delay = 0,
  yOffset = 8,
  inView = false,
  inViewMargin = '-50px',
  blur = '4px',
}: BlurFadeProps) {
  const ref = useRef(null);
  const inViewResult = useInView(ref, { once: true, margin: inViewMargin });
  const isInView = !inView || inViewResult;
  const defaultVariants: Variants = {
    hidden: { y: yOffset, opacity: 0, filter: `blur(${blur})` },
    visible: { y: 0, opacity: 1, filter: `blur(0px)` },
  };
  const combinedVariants = variant ?? defaultVariants;
  return (
    <motion.div
      ref={ref}
      initial='hidden'
      animate={isInView ? 'visible' : 'hidden'}
      variants={combinedVariants}
      transition={{
        delay,
        duration,
        ease: [0.23, 1, 0.32, 1],
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
