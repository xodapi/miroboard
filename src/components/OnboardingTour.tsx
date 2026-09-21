import { TOUR_STEPS } from '../board/tour'

export interface OnboardingTourProps {
  /** Index into TOUR_STEPS. The caller only renders this when it is >= 0. */
  step: number
  onNext: (step: number) => void
  onFinish: () => void
}

/**
 * The introductory overlay.
 *
 * Out-of-range steps fall back to the first card rather than rendering nothing,
 * because the step index is restored from localStorage and can outlive a change
 * to the step list.
 */
export function OnboardingTour({ step, onNext, onFinish }: OnboardingTourProps) {
  const [title, text] = TOUR_STEPS[step] ?? TOUR_STEPS[0]
  const isLast = step === TOUR_STEPS.length - 1

  return (
    <div className="absolute inset-0 z-[70] grid place-items-center bg-slate-900/45 p-4 backdrop-blur-sm" data-ui data-testid="onboarding-tour">
      <section className="w-full max-w-md rounded-[28px] bg-white p-7 shadow-2xl">
        <div className="mb-4 flex gap-1">
          {TOUR_STEPS.map((_, index) => (
            <span key={index} className={`h-1.5 flex-1 rounded-full ${index <= step ? 'bg-violet-600' : 'bg-slate-200'}`} />
          ))}
        </div>
        <div className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-violet-600">Тур {step + 1} из {TOUR_STEPS.length}</div>
        <h2 className="text-2xl font-bold text-slate-900">{title}</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">{text}</p>
        <div className="mt-7 flex items-center justify-between">
          <button onClick={onFinish} className="text-sm font-semibold text-slate-500 hover:text-slate-800">Пропустить</button>
          <button
            onClick={() => (isLast ? onFinish() : onNext(step + 1))}
            className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-violet-700"
          >
            {isLast ? 'Начать работу' : 'Далее'}
          </button>
        </div>
      </section>
    </div>
  )
}
