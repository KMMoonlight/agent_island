import * as React from 'react';

import { cn } from '@/lib/utils';

const Label = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(({ className, ...props }, ref) => (
  <label ref={ref} className={cn('text-[9px] font-medium leading-none text-zinc-950 peer-disabled:cursor-not-allowed peer-disabled:opacity-70', className)} {...props} />
));
Label.displayName = 'Label';

export { Label };
