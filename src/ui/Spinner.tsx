export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12" role="status" aria-label={label}>
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-leaf-100 border-t-leaf-600" />
      <span className="text-sm text-slate-500">{label}</span>
    </div>
  );
}

export function FullScreenSpinner() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-leaf-50">
      <Spinner />
    </div>
  );
}
