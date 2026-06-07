export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
      {message}
    </div>
  )
}
