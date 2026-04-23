import * as React from 'react';

import { cn } from '@/lib/utils';

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(({ className, type, ...props }, ref) => {
  return (
    <input
      className={cn(
        'flex h-8 w-full appearance-none rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-[9px] text-zinc-950 shadow-none ring-0 ring-offset-0 file:border-0 file:bg-transparent file:text-[9px] file:font-medium file:text-zinc-950 placeholder:text-zinc-500 outline-none focus:border-zinc-200 focus:outline-none focus:shadow-none focus:ring-0 focus:ring-offset-0 focus-visible:outline-none focus-visible:shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50',
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
