"use client";

import type { PointerEvent } from "react";
import { useEffect, useRef } from "react";
import Image from "next/image";

type SignaturePadProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
};

export default function SignaturePad({ label, value, onChange }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const dprRef = useRef(1);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const setupCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      dprRef.current = dpr;
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));

      const context = canvas.getContext("2d");
      if (!context) {
        return;
      }
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.lineWidth = 2;
      context.strokeStyle = "#0f172a";
      context.lineJoin = "round";
      context.lineCap = "round";
    };

    setupCanvas();
    window.addEventListener("resize", setupCanvas);

    return () => {
      window.removeEventListener("resize", setupCanvas);
    };
  }, []);

  const getPoint = (event: PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  };

  const handlePointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!context) {
      return;
    }
    drawingRef.current = true;
    const point = getPoint(event);
    lastPointRef.current = point;
    context.beginPath();
    context.moveTo(point.x, point.y);
  };

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) {
      return;
    }
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!context) {
      return;
    }
    const point = getPoint(event);
    const last = lastPointRef.current;
    if (last) {
      context.lineTo(point.x, point.y);
      context.stroke();
      lastPointRef.current = point;
    }
  };

  const handlePointerUp = () => {
    drawingRef.current = false;
    lastPointRef.current = null;
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) {
      return;
    }
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    const dpr = dprRef.current;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const handleUseSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const dataUrl = canvas.toDataURL("image/png");
    onChange(dataUrl);
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm">
      <p className="text-sm font-semibold text-slate-900">{label}</p>
      {value && (
        <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
          <Image
            src={value}
            alt={label}
            width={420}
            height={80}
            unoptimized
            className="h-auto w-full object-contain"
          />
        </div>
      )}
      <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-white">
        <canvas
          ref={canvasRef}
          width={420}
          height={140}
          className="h-36 w-full touch-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleUseSignature}
          className="rounded-xl border border-[#e57648] bg-[#e57648] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#d7653b]"
        >
          Utiliser cette signature
        </button>
        <button
          type="button"
          onClick={handleClear}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300"
        >
          Effacer
        </button>
      </div>
    </div>
  );
}
