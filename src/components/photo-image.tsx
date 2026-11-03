"use client";

import { useEffect, useState } from "react";

import { getBlob } from "@/lib/incidents";
import { cn } from "@/lib/utils";

// Full-size sibling of PhotoThumb, for the S18b printable page, where photos
// need to show at their own aspect ratio rather than a cropped square.
export function PhotoImage({ blobId, alt, className }: { blobId: string; alt: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    getBlob(blobId).then((stored) => {
      if (!active || !stored) return;
      objectUrl = URL.createObjectURL(stored.blob);
      setUrl(objectUrl);
    });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [blobId]);

  if (!url) {
    return <div className={cn("bg-muted", className)} aria-hidden />;
  }

  // eslint-disable-next-line @next/next/no-img-element -- object URL, not a static asset
  return <img src={url} alt={alt} className={cn("object-contain", className)} />;
}
