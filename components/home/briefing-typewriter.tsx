'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export interface BriefingTypewriterProps {
  readonly text: string;
  readonly className?: string;
  readonly onComplete?: () => void;
}

/**
 * Character-paced briefing copy for the home mission card.
 * Full text is exposed to assistive tech immediately; the animation is visual only.
 */
export function BriefingTypewriter({ text, className, onComplete }: BriefingTypewriterProps) {
  const [typed, setTyped] = useState('');
  const [typedDone, setTypedDone] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduceMotion(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      onCompleteRef.current?.();
      return;
    }

    /* eslint-disable react-hooks/set-state-in-effect -- Animation driver: character-paced briefing display */
    setTyped('');
    setTypedDone(false);
    /* eslint-enable react-hooks/set-state-in-effect */
    let cancelled = false;
    let index = 0;
    let timer: number | undefined;

    const tick = () => {
      if (cancelled) return;
      if (index >= text.length) {
        setTypedDone(true);
        onCompleteRef.current?.();
        return;
      }
      index += 1;
      setTyped(text.slice(0, index));
      const justTyped = text[index - 1] ?? '';
      timer = window.setTimeout(tick, typeDelay(justTyped));
    };

    timer = window.setTimeout(tick, 40);
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [text, reduceMotion]);

  const visible = reduceMotion ? text : typed;
  const done = reduceMotion || typedDone;

  return (
    <div
      className={cn('relative px-5 pt-2 pb-3 min-h-[148px]', className)}
      aria-label={text}
      data-briefing-complete={done ? 'true' : 'false'}
      data-testid="sortie-briefing"
    >
      <p className="sr-only">{text}</p>
      <p
        aria-hidden="true"
        className="whitespace-pre-wrap font-mono text-[14px] leading-relaxed text-slate-600 dark:text-slate-300"
      >
        {visible}
        {!done && !reduceMotion ? (
          <span
            className="ml-0.5 inline-block w-[0.55ch] translate-y-px border-b-2 border-current align-baseline"
            style={{ animation: 'briefing-caret-blink 0.9s step-end infinite' }}
          />
        ) : null}
      </p>
      <style jsx>{`
        @keyframes briefing-caret-blink {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}

function typeDelay(ch: string): number {
  if (ch === '\n') return 220;
  if (/[.!?]/.test(ch)) return 160;
  if (/[,;:]/.test(ch)) return 90;
  return 28;
}
