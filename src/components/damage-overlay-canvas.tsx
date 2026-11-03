"use client";

import { useEffect, useRef, useState } from "react";

import { colorForItemIndex } from "@/lib/damage-colors";
import { getBlob } from "@/lib/incidents";
import type { DamageAnalysis, DamageItem } from "@/lib/types";

// S11 Damage review canvas: the photo with coloured semi-transparent masks
// (one colour per item) and a thin outline of the vehicle mask (SPEC section
// 6 and 8.3 "Client rendering"). The data model (section 7) has no stored
// mask raster size, only the box the mask was requested on, so this assumes
// a mask's raster is the same size as its own box (the cookbook default
// SPEC 8.3 notes) and draws its path directly at the box origin, with no
// extra scale.
export interface DamageOverlayItem {
  item: DamageItem;
  colorIndex: number;
}

interface DamageOverlayCanvasProps {
  blobId: string;
  width: number;
  height: number;
  vehicleMask?: DamageAnalysis["vehicleMask"];
  overlayItems: DamageOverlayItem[];
  showVehicleOutline?: boolean;
}

export function DamageOverlayCanvas({
  blobId,
  width,
  height,
  vehicleMask,
  overlayItems,
  showVehicleOutline = true,
}: DamageOverlayCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    getBlob(blobId).then((stored) => {
      if (!active || !stored) return;
      objectUrl = URL.createObjectURL(stored.blob);
      setImageUrl(objectUrl);
    });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [blobId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageUrl) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let active = true;
    const image = new Image();
    image.onload = () => {
      if (!active) return;
      canvas.width = width;
      canvas.height = height;
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(image, 0, 0, width, height);

      if (showVehicleOutline && vehicleMask) {
        ctx.save();
        ctx.translate(vehicleMask.boxPx.left, vehicleMask.boxPx.top);
        ctx.strokeStyle = "rgba(11, 31, 58, 0.8)"; // --navy at 80%
        ctx.lineWidth = 2;
        ctx.stroke(new Path2D(vehicleMask.svgPath));
        ctx.restore();
      }

      for (const { item, colorIndex } of overlayItems) {
        const color = colorForItemIndex(colorIndex);
        const box = item.maskBoxPx ?? item.boxPx;
        ctx.save();
        ctx.translate(box.left, box.top);
        if (item.maskSvgPath) {
          const path = new Path2D(item.maskSvgPath);
          ctx.fillStyle = withAlpha(color, 0.35);
          ctx.strokeStyle = withAlpha(color, 0.8);
          ctx.lineWidth = 2;
          ctx.fill(path);
          ctx.stroke(path);
        } else {
          // "Mask not available": the box outline only (SPEC F4 edge state).
          ctx.strokeStyle = withAlpha(color, 0.8);
          ctx.lineWidth = 2;
          ctx.setLineDash([6, 4]);
          ctx.strokeRect(0, 0, box.right - box.left, box.bottom - box.top);
          ctx.setLineDash([]);
        }
        ctx.restore();

        drawNumberedPin(ctx, box.left, box.top, colorIndex + 1, color);
      }
    };
    image.src = imageUrl;
    return () => {
      active = false;
    };
  }, [imageUrl, width, height, vehicleMask, overlayItems, showVehicleOutline]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="w-full rounded-lg bg-muted"
      style={{ aspectRatio: `${width} / ${height}` }}
    />
  );
}

function drawNumberedPin(ctx: CanvasRenderingContext2D, x: number, y: number, number: number, color: string): void {
  const radius = 14;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "white";
  ctx.stroke();
  ctx.fillStyle = "white";
  ctx.font = "bold 14px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(number), x, y + 1);
  ctx.restore();
}

function withAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
