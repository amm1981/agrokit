import type { ReactNode } from 'react'

export function PageHeader({
  title,
  description,
  meta,
}: {
  title: string
  description?: string
  meta?: ReactNode
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-4">
      <div>
        <h2 className="text-xl font-semibold text-slate-950 md:text-2xl">{title}</h2>
        {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
      </div>
      {meta ? <div className="flex flex-wrap items-center gap-2">{meta}</div> : null}
    </header>
  )
}
