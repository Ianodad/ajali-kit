"use client";

import { useEffect, useState } from "react";

import { getBlob } from "@/lib/incidents";

// Renders a thumbnail from its blob id, creating and releasing an object URL
// as the component mounts and unmounts.
export function PhotoThumb({ blobId, alt }: { blobId: string; alt: string }) {
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
    return <div className="size-16 rounded-md bg-muted" aria-hidden />;
  }

  // eslint-disable-next-line @next/next/no-img-element -- object URL, not a static asset
  return <img src={url} alt={alt} className="size-16 rounded-md object-cover" />;
}
