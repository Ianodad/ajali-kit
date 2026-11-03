import { colorForItemIndex } from "./damage-colors";
import { maskTransform } from "./mask-geometry";
import type { DamageAnalysis, DamageItem } from "./types";

// Shared with flatten-photo.ts (Phase 6 PDF export): the exact same drawing
// code that renders the S11 review canvas on screen also flattens a damage
// photo to a PNG for the claim pack, so the PDF never drifts from what the
// user confirmed on screen (SPEC A9: "annotated photos match the on-screen
// overlays").
export interface DamageOverlayItem {
  item: DamageItem;
  colorIndex: number;
}

export function drawDamageOverlay(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  width: number,
  height: number,
  vehicleMask: DamageAnalysis["vehicleMask"] | undefined,
  overlayItems: DamageOverlayItem[],
  showVehicleOutline = true,
): void {
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);

  if (showVehicleOutline && vehicleMask) {
    const transform = maskTransform(vehicleMask.boxPx, vehicleMask.rasterWidth, vehicleMask.rasterHeight);
    ctx.save();
    ctx.translate(transform.translateX, transform.translateY);
    ctx.scale(transform.scaleX, transform.scaleY);
    ctx.strokeStyle = "rgba(11, 31, 58, 0.8)"; // --navy at 80%
    ctx.lineWidth = 2 / Math.min(transform.scaleX, transform.scaleY);
    ctx.stroke(new Path2D(vehicleMask.svgPath));
    ctx.restore();
  }

  for (const { item, colorIndex } of overlayItems) {
    const color = colorForItemIndex(colorIndex);
    const box = item.maskBoxPx ?? item.boxPx;
    if (item.maskSvgPath) {
      // The mask's raster is not always the same size as its box (SPEC
      // 8.3), so scale, don't just translate.
      const transform = maskTransform(box, item.maskRasterWidth, item.maskRasterHeight);
      const path = new Path2D(item.maskSvgPath);
      ctx.save();
      ctx.translate(transform.translateX, transform.translateY);
      ctx.scale(transform.scaleX, transform.scaleY);
      ctx.fillStyle = withAlpha(color, 0.42);
      ctx.strokeStyle = color;
      ctx.lineWidth = 3 / Math.min(transform.scaleX, transform.scaleY);
      ctx.fill(path);
      ctx.stroke(path);
      ctx.restore();
    } else {
      // "Mask not available": the box outline only (SPEC F4 edge state).
      ctx.save();
      ctx.translate(box.left, box.top);
      ctx.strokeStyle = withAlpha(color, 0.8);
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(0, 0, box.right - box.left, box.bottom - box.top);
      ctx.setLineDash([]);
      ctx.restore();
    }

    drawNumberedPin(ctx, box.left, box.top, colorIndex + 1, color);
  }
}

function drawNumberedPin(ctx: CanvasRenderingContext2D, x: number, y: number, number: number, color: string): void {
  const radius = 22;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "white";
  ctx.stroke();
  ctx.fillStyle = "white";
  ctx.font = "bold 22px sans-serif";
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
