type ActionNoticeProps = {
  message?: string
  status?: string
}

export default function ActionNotice({ message, status }: ActionNoticeProps) {
  if (!message) return null

  const isBlocked = status === 'blocked'

  return (
    <div
      className={
        isBlocked
          ? 'mb-6 rounded-xl border border-[#B11218] bg-red-950/50 p-4 text-red-100'
          : 'mb-6 rounded-xl border border-[#B11218] bg-[#0B0B0B] p-4 text-yellow-100'
      }
    >
      <div className="font-bold">{isBlocked ? 'Action blocked' : 'Action saved'}</div>
      <div className="mt-1 text-sm">{message}</div>
    </div>
  )
}
