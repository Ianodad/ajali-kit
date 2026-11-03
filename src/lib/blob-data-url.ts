// Encodes a Blob as a base64 data: URL, the shape /api/analyze-photo and
// /api/segment expect for imageDataUrl (SPEC 8.1: "sends compressed images as
// base64 data URLs in JSON"). Uses ArrayBuffer + btoa instead of FileReader
// so it works the same in the browser and under Vitest's Node environment.
export async function blobToDataUrl(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  const base64 = btoa(binary);
  return `data:${blob.type || "application/octet-stream"};base64,${base64}`;
}
