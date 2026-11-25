import React, { useEffect, useRef } from "react";

interface Props {
  variant: "light" | "warm";
}

interface Mote {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  phase: number;
  speed: number;
  color: string;
  alpha: number;
  ring: boolean;
}

const PALETTES: Record<Props["variant"], string[]> = {
  light: [
    "91, 61, 245",   // indigo-violet
    "2, 132, 199",   // sky cyan
    "168, 85, 247",  // soft prism violet
    "56, 189, 248",  // daylight azure
  ],
  warm: [
    "217, 119, 6",   // warm amber
    "180, 83, 9",    // terracotta gold
    "67, 56, 202",   // indigo ink
    "15, 118, 110",  // sage teal
  ],
};

export default function ThemeAmbientCanvas({ variant }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const palette = PALETTES[variant];

    let width = 0;
    let height = 0;
    let dpr = 1;
    let motes: Mote[] = [];
    let rafId = 0;
    const mouse = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5, active: 0 };

    function seedMotes() {
      const area = Math.max(1, width * height);
      const count = Math.min(54, Math.max(22, Math.round(area / 28000)));
      motes = Array.from({ length: count }, (_, i) => {
        const isBokeh = i % 5 === 0;
        return {
          x: Math.random() * width,
          y: Math.random() * height,
          r: isBokeh ? 10 + Math.random() * 18 : 1.6 + Math.random() * 3.4,
          vx: (Math.random() - 0.5) * (variant === "warm" ? 0.16 : 0.22),
          vy: variant === "warm"
            ? -(0.12 + Math.random() * 0.24)
            : (Math.random() - 0.5) * 0.18,
          phase: Math.random() * Math.PI * 2,
          speed: 0.6 + Math.random() * 1.1,
          color: palette[i % palette.length],
          alpha: isBokeh ? 0.08 + Math.random() * 0.08 : 0.24 + Math.random() * 0.28,
          ring: isBokeh && i % 10 === 0,
        };
      });
    }

    function resize() {
      if (!canvas) return;
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      seedMotes();
    }

    function onMouseMove(e: MouseEvent) {
      if (!width || !height) return;
      mouse.tx = e.clientX / width;
      mouse.ty = e.clientY / height;
      mouse.active = 1;
    }

    function drawFrame(now: number, animate: boolean) {
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);

      mouse.x += (mouse.tx - mouse.x) * 0.04;
      mouse.y += (mouse.ty - mouse.y) * 0.04;
      const pxOffset = (mouse.x - 0.5) * 18 * mouse.active;
      const pyOffset = (mouse.y - 0.5) * 14 * mouse.active;

      const t = now * 0.001;

      // Subtle connecting constellation shimmer on Daylight near cursor
      if (variant === "light" && mouse.active > 0.05) {
        const mx = mouse.x * width;
        const my = mouse.y * height;
        for (let i = 0; i < motes.length; i++) {
          const m = motes[i];
          if (m.r > 6) continue;
          const dx = m.x - mx;
          const dy = m.y - my;
          const dist = Math.hypot(dx, dy);
          if (dist < 150) {
            const lineAlpha = (1 - dist / 150) * 0.16;
            ctx.strokeStyle = `rgba(91, 61, 245, ${lineAlpha.toFixed(3)})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(mx, my);
            ctx.lineTo(m.x, m.y);
            ctx.stroke();
          }
        }
      }

      for (let i = 0; i < motes.length; i++) {
        const m = motes[i];
        if (animate) {
          m.x += m.vx + Math.sin(t * m.speed + m.phase) * 0.08;
          m.y += m.vy + Math.cos(t * m.speed * 0.8 + m.phase) * 0.06;

          if (m.x < -30) m.x = width + 30;
          if (m.x > width + 30) m.x = -30;
          if (m.y < -30) m.y = height + 30;
          if (m.y > height + 30) m.y = -30;
        }

        const pulse = 0.72 + 0.28 * Math.sin(t * m.speed * 1.3 + m.phase);
        const drawX = m.x + pxOffset * (m.r > 6 ? 0.6 : 0.25);
        const drawY = m.y + pyOffset * (m.r > 6 ? 0.6 : 0.25);
        const a = m.alpha * pulse;

        if (m.ring) {
          ctx.strokeStyle = `rgba(${m.color}, ${(a * 1.4).toFixed(3)})`;
          ctx.lineWidth = 1.25;
          ctx.beginPath();
          ctx.arc(drawX, drawY, m.r, 0, Math.PI * 2);
          ctx.stroke();
        } else if (m.r > 6) {
          const grad = ctx.createRadialGradient(drawX, drawY, 0, drawX, drawY, m.r);
          grad.addColorStop(0, `rgba(${m.color}, ${(a * 1.35).toFixed(3)})`);
          grad.addColorStop(1, `rgba(${m.color}, 0)`);
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(drawX, drawY, m.r, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = `rgba(${m.color}, ${a.toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(drawX, drawY, m.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    let last = 0;
    function loop(now: number) {
      rafId = requestAnimationFrame(loop);
      if (document.hidden || now - last < 33) return;
      last = now;
      drawFrame(now, !reducedMotion);
    }

    resize();
    drawFrame(performance.now(), false);
    if (!reducedMotion) {
      rafId = requestAnimationFrame(loop);
    }

    window.addEventListener("resize", resize);
    window.addEventListener("mousemove", onMouseMove, { passive: true });

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMouseMove);
    };
  }, [variant]);

  return <canvas ref={canvasRef} className="theme-ambient-canvas" aria-hidden="true" />;
}
