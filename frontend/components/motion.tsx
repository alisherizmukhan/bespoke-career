"use client";

import { useEffect, useRef, useState } from "react";
import cx from "clsx";

/** True when the visitor asked the OS for less motion. Every effect below then shows its final state at once. */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(m.matches);
    const on = () => setReduced(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return reduced;
}

/** Fires once when the element first scrolls into view. */
export function useInView<T extends Element>(margin = "0px 0px -10% 0px") {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === "undefined") { setSeen(true); return; }
    // Already on screen at mount: start right away.
    const r = el.getBoundingClientRect();
    if (r.top < window.innerHeight && r.bottom > 0 && r.left < window.innerWidth && r.right > 0) { setSeen(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } }, { rootMargin: margin });
    io.observe(el);
    // Safety net: if the browser never reports visibility (background tab, print, embeds), show the content anyway.
    const fallback = setTimeout(() => setSeen(true), 2500);
    return () => { io.disconnect(); clearTimeout(fallback); };
  }, [seen, margin]);
  return [ref, seen] as const;
}

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * A number that rolls to its new value. It counts up from zero the first time it scrolls into view and
 * rolls from the old value to the new one on every change (e.g. Monthly ↔ Yearly), with a short glitch.
 */
export function RollingNumber({ value, format = (n) => Math.round(n).toLocaleString("en-US"), duration = 650, glitch = true, countUp = false, className }: {
  value: number; format?: (n: number) => string; duration?: number; glitch?: boolean; countUp?: boolean; className?: string;
}) {
  const reduced = useReducedMotion();
  const [ref, seen] = useInView<HTMLSpanElement>();
  // Without countUp the first value shows as is (no flash of $0) and only later changes roll.
  const [shown, setShown] = useState<number | null>(countUp ? null : value);
  const [glitching, setGlitching] = useState(false);
  const from = useRef<number | null>(countUp ? null : value);

  useEffect(() => {
    // Off screen: just keep the value current (a count-up waits until it is seen).
    if (!seen) { if (!countUp) { setShown(value); from.current = value; } return; }
    if (reduced) { setShown(value); from.current = value; return; }
    const start = from.current ?? 0;
    if (start === value) { setShown(value); return; }
    const changed = from.current !== null;
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / duration);
      setShown(start + (value - start) * easeOut(t));
      if (t < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    // Background tabs pause animation frames: make sure the final value always lands.
    const settle = setTimeout(() => { cancelAnimationFrame(raf); setShown(value); from.current = value; }, duration + 80);
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (glitch && changed) { setGlitching(true); timer = setTimeout(() => setGlitching(false), 420); }
    return () => { cancelAnimationFrame(raf); clearTimeout(settle); if (timer) clearTimeout(timer); from.current = value; };
  }, [value, seen, reduced, duration, glitch, countUp]);

  return (
    <span ref={ref} className={cx("tabular inline-block", glitching && "glitch", className)} data-text={format(value)}>
      {/* The final value is always what assistive tech and no-JS readers get. */}
      <span aria-hidden>{format(shown ?? 0)}</span>
      <span className="sr-only">{format(value)}</span>
    </span>
  );
}

/** Types the text out once, character by character, with a blinking caret while typing. */
export function TypeOnce({ text, speed = 38, delay = 250, className }: { text: string; speed?: number; delay?: number; className?: string }) {
  const reduced = useReducedMotion();
  const [ref, seen] = useInView<HTMLSpanElement>();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!seen) return;
    if (reduced) { setN(text.length); return; }
    setN(0);
    let i = 0;
    let timer: ReturnType<typeof setTimeout>;
    const step = () => { i += 1; setN(i); if (i < text.length) timer = setTimeout(step, speed); };
    timer = setTimeout(step, delay);
    return () => clearTimeout(timer);
  }, [text, seen, reduced, speed, delay]);
  const done = n >= text.length;
  return (
    <span ref={ref} className={className}>
      <span aria-hidden>{text.slice(0, n)}{!done && <span className="caret" />}</span>
      <span className="sr-only">{text}</span>
    </span>
  );
}

/** Cycles through phrases: types one, holds, deletes it, types the next. */
export function TypeCycle({ words, className, hold = 1800 }: { words: string[]; className?: string; hold?: number }) {
  const reduced = useReducedMotion();
  const [i, setI] = useState(0);
  const [n, setN] = useState(0);
  const [deleting, setDeleting] = useState(false);
  useEffect(() => {
    if (reduced || !words.length) return;
    const w = words[i % words.length];
    let t: ReturnType<typeof setTimeout>;
    if (!deleting && n < w.length) t = setTimeout(() => setN(n + 1), 55);
    else if (!deleting) t = setTimeout(() => setDeleting(true), hold);
    else if (n > 0) t = setTimeout(() => setN(n - 1), 28);
    else t = setTimeout(() => { setDeleting(false); setI(i + 1); }, 250);
    return () => clearTimeout(t);
  }, [n, deleting, i, words, hold, reduced]);
  const w = words[i % words.length] || "";
  return (
    <span className={className}>
      <span aria-hidden>{reduced ? words[0] : w.slice(0, n)}<span className="caret" /></span>
      <span className="sr-only">{words.join(", ")}</span>
    </span>
  );
}

/** Fades and lifts its children in when they scroll into view; `index` staggers siblings. */
export function Reveal({ children, index = 0, className, as: Tag = "div" }: { children: React.ReactNode; index?: number; className?: string; as?: "div" | "li" }) {
  const [ref, seen] = useInView<HTMLDivElement>();
  return (
    <Tag ref={ref as React.Ref<never>} className={cx("reveal", seen && "reveal-in", className)} style={{ transitionDelay: seen ? `${Math.min(index, 8) * 70}ms` : undefined }}>
      {children}
    </Tag>
  );
}
