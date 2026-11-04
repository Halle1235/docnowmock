export const MAX_CALL_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_CHAT_CHARACTERS = 1000;
export function validCallFileMetadata(name: string, type: string, size: number) {
  return typeof name === "string" && name.length > 0 && name.length <= 150 && !/[\x00-\x1f/\\]/.test(name) && ["image/png", "image/jpeg", "application/pdf"].includes(type) && Number.isInteger(size) && size > 0 && size <= MAX_CALL_FILE_BYTES;
}
export async function validCallFileContent(blob: Blob) {
  const bytes = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
  return blob.type === "image/png" ? [137,80,78,71,13,10,26,10].every((v,i) => bytes[i] === v)
    : blob.type === "image/jpeg" ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    : blob.type === "application/pdf" && String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-";
}