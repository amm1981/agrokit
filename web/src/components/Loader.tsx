export function Loader({ label = 'Cargando...' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
      <div className="flex items-center gap-3 text-slate-700">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
        <span className="text-sm font-medium">{label}</span>
      </div>
    </div>
  )
}
