"use client";

import { useEffect, useState } from "react";

// P7.1: a global offline banner, since the AI steps and the claim draft need
// a connection but everything else (capture, forms, the PDF) keeps working
// from what is already on the phone. Mounted once in the root layout so it
// shows no matter which screen is open.
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- navigator.onLine is not known until the browser mounts this.
    setOffline(!navigator.onLine);
    const goOnline = () => setOffline(false);
    const goOffline = () => setOffline(true);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div role="status" className="bg-amber px-4 py-2 text-center text-sm font-medium text-navy">
      You are offline. Your claim stays saved on this phone. Photo checks and the claim draft need a connection.
    </div>
  );
}
