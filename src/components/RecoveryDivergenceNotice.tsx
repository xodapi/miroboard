interface RecoveryDivergenceNoticeProps {
  message: string
}

export function RecoveryDivergenceNotice({ message }: RecoveryDivergenceNoticeProps) {
  return (
    <span role="alert" aria-live="assertive" data-testid="recovery-divergence" className="max-w-[280px] truncate rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800" title={message}>
      Восстановлено из локального кэша: файл отстаёт
    </span>
  )
}
