import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';

const inputClass =
  'w-full rounded-lg border border-leaf-100 bg-white px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-leaf-500 focus:outline-none';

function Label({ text, children }: { text: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{text}</span>
      {children}
    </label>
  );
}

export function TextField({
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <Label text={label}>
      <input className={inputClass} {...props} />
    </Label>
  );
}

export function SelectField({
  label,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  return (
    <Label text={label}>
      <select className={inputClass} {...props}>
        {children}
      </select>
    </Label>
  );
}

export function CheckboxField({
  label,
  hint,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="flex items-start gap-3">
      <input
        type="checkbox"
        className="mt-0.5 h-5 w-5 rounded border-leaf-300 accent-leaf-600"
        {...props}
      />
      <span>
        <span className="block text-sm font-medium text-slate-700">{label}</span>
        {hint && <span className="block text-xs leading-relaxed text-slate-500">{hint}</span>}
      </span>
    </label>
  );
}

/** Two-to-four mutually exclusive options as a mobile-friendly segmented control. */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div>
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      <div className="grid auto-cols-fr grid-flow-col gap-1 rounded-lg border border-leaf-100 bg-leaf-50 p-1">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`rounded-md px-2 py-2 text-sm font-medium transition-colors ${
              option.value === value
                ? 'bg-white text-leaf-700 shadow-sm'
                : 'text-slate-500 hover:text-leaf-600'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <p className="text-sm text-red-600">{children}</p>;
}
