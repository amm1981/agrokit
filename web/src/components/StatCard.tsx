export function StatCard({
  title,
  value,
  helper,
  tone = 'default',
}: {
  title: string
  value: number
  helper?: string
  tone?: 'default' | 'success' | 'warning'
}) {
  const toneClass =
    tone === 'success'
      ? 'border-emerald-200 bg-emerald-50'
      : tone === 'warning'
        ? 'border-amber-200 bg-amber-50'
        : 'border-slate-200 bg-white'

  return (
    <article className={`rounded-2xl border p-5 shadow-sm ${toneClass}`}>
      <p className="text-sm font-medium text-slate-600">{title}</p>
      <p className="mt-1 text-3xl font-semibold text-slate-900">{value}</p>
      {helper ? <p className="mt-2 text-xs text-slate-500">{helper}</p> : null}
    </article>
  )
}
