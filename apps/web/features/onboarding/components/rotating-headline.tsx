"use client";

import { useEffect, useState } from "react";

const messages = [
  "Your AI agent finds jobs and projects for you.",
  "Your AI scout for work worth pursuing.",
  "Your AI scout alerts you to jobs and projects.",
] as const;

/** Rotates three product promises while keeping the form steady and respecting reduced motion. */
export function RotatingHeadline() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;

    const interval = window.setInterval(() => {
      if (document.hidden) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      if (document.activeElement?.closest(".scout-goal-form")) return;

      setActiveIndex((index) => (index + 1) % messages.length);
    }, 6500);

    return () => window.clearInterval(interval);
  }, [paused]);

  return (
    <h1
      className="scout-display scout-goal-heading"
      tabIndex={-1}
      aria-live="off"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {messages.map((message, index) => (
        <span
          key={message}
          className="scout-headline-message"
          data-active={index === activeIndex}
          aria-hidden={index !== activeIndex}
        >
          {message}
        </span>
      ))}
    </h1>
  );
}
