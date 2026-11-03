"use client";

import { useEffect, useRef, useState } from "react";

import { drawDamageOverlay, type DamageOverlayItem } from "@/lib/draw-damage-overlay";
import { getBlob } from "@/lib/incidents";
import type { DamageAnalysis } from "@/lib/types";

// S11 Damage review canvas: the photo with coloured semi-transparent masks
// (one colour per item) and a thin outline of the vehicle mask (SPEC section
// 6 and 8.3 "Client rendering"). The actual drawing is in
// lib/draw-damage-overlay.ts, shared with the Phase 6 PDF flatten step.
export type { DamageOverlayItem } from "@/lib/draw-damage-overlay";

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
      drawDamageOverlay(ctx, image, width, height, vehicleMask, overlayItems, showVehicleOutline);
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
