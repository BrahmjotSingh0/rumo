import { forwardRef } from 'react';
import clsx from 'clsx';

const Input = forwardRef(({ 
  className, 
  type = 'text',
  error,
  label,
  helperText,
  ...props 
}, ref) => {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-gray-300 mb-2">
          {label}
        </label>
      )}
      <input
        type={type}
        className={clsx(
          'input',
          error && 'border-red-500 focus:border-red-500 focus:ring-red-500',
          className
        )}
        ref={ref}
        {...props}
      />
      {(error || helperText) && (
        <p className={clsx(
          'mt-1 text-sm',
          error ? 'text-red-400' : 'text-gray-400'
        )}>
          {error || helperText}
        </p>
      )}
    </div>
  );
});

Input.displayName = 'Input';

export default Input;