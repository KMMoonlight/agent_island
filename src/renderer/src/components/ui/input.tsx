import * as React from 'react';

import { cn } from '@/lib/utils';

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(({ className, type, ...props }, ref) => {
  return (
    <input
      className={cn(
        'flex h-8 w-full rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-[9px] text-zinc-950 ring-offset-white file:border-0 file:bg-transparent file:text-[9px] file:font-medium file:text-zinc-950 placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      ref={ref}
      type={type}
      {...props}
    />
  );
});
Input.displayName = 'Input';

export { Input };
