type Props = {
  onCancel: () => void
  onDiscard: () => void
  onSave: () => void
}

export function UnsavedChangesDialog({ onCancel, onDiscard, onSave }: Props) {
  return (
    <div className="absolute inset-0 z-[80] grid place-items-center bg-slate-900/45 p-4 backdrop-blur-sm">
      <section role="dialog" aria-modal="true" aria-labelledby="unsaved-changes-title" className="w-full max-w-md rounded-[28px] bg-white p-7 shadow-2xl">
        <h2 id="unsaved-changes-title" className="text-2xl font-bold text-slate-900">Несохраненные изменения</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">Сохранить изменения перед открытием другого документа?</p>
        <div className="mt-7 flex flex-wrap justify-end gap-2">
          <button onClick={onCancel} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100">Отмена</button>
          <button onClick={onDiscard} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50">Не сохранять</button>
          <button onClick={onSave} className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-violet-700">Сохранить</button>
        </div>
      </section>
    </div>
  )
}
