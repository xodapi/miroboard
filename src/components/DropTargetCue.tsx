export function DropTargetCue() {
  return (
    <div className="absolute inset-4 z-40 flex items-center justify-center rounded-3xl border-4 border-dashed border-violet-500 bg-violet-100/90 text-lg font-bold text-violet-800"
      role="status" aria-live="polite" data-testid="drop-target-cue">
      Отпустите, чтобы открыть .mboard
    </div>
  )
}
