import { cva, type VariantProps } from 'class-variance-authority';

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-md text-[9px] font-normal leading-none tracking-normal transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ring-offset-white [&_svg]:pointer-events-none [&_svg]:size-2.5 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-zinc-900 text-zinc-50 hover:bg-zinc-900/90',
        destructive: 'bg-red-600 text-white hover:bg-red-600/90',
        outline: 'border border-zinc-200 bg-white hover:bg-zinc-100 hover:text-zinc-900',
        secondary: 'bg-zinc-100 text-zinc-900 hover:bg-zinc-100/80',
        ghost: 'hover:bg-zinc-100 hover:text-zinc-900',
        link: 'text-zinc-900 underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-6 px-2 py-0.5',
        sm: 'h-6 rounded-md px-1.5',
        lg: 'h-7 rounded-md px-3',
        icon: 'h-6 w-6',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export type ButtonVariantProps = VariantProps<typeof buttonVariants>;
