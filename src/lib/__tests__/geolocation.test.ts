import { afterEach, describe, expect, it, vi } from "vitest";

import { getCurrentPosition } from "../geolocation";

describe("getCurrentPosition", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves with lat, lng and accuracy on success", async () => {
    vi.stubGlobal("navigator", {
      geolocation: {
        getCurrentPosition: (success: PositionCallback) => {
          success({
            coords: { latitude: -1.286389, longitude: 36.817223, accuracy: 12 },
          } as GeolocationPosition);
        },
      },
    });

    await expect(getCurrentPosition()).resolves.toEqual({
      lat: -1.286389,
      lng: 36.817223,
      accuracyM: 12,
    });
  });

  it("resolves null instead of throwing when permission is denied", async () => {
    vi.stubGlobal("navigator", {
      geolocation: {
        getCurrentPosition: (_success: PositionCallback, error: PositionErrorCallback) => {
          error({ code: 1, message: "denied" } as GeolocationPositionError);
        },
      },
    });

    await expect(getCurrentPosition()).resolves.toBeNull();
  });

  it("resolves null when geolocation is not supported", async () => {
    vi.stubGlobal("navigator", {});
    await expect(getCurrentPosition()).resolves.toBeNull();
  });
});
