import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost';

const styles: Record<Variant, string> = {
  primary:
    'bg-leaf-600 text-white hover:bg-leaf-700 disabled:bg-leaf-300 disabled:text-white',
  secondary:
    'border border-leaf-300 bg-white text-leaf-700 hover:bg-leaf-50 disabled:text-leaf-300',
  ghost: 'text-leaf-600 hover:bg-leaf-50 disabled:text-leaf-300',
};

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={`rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed ${styles[variant]} ${className}`}
      {...props}
    />
  );
}
