export type RunCursor = { projectId: string; timestamp: string; id: string };

const uuid = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;

export function encodeRunCursor(cursor: RunCursor) {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

export function parseRunCursor(value: string, projectId: string): RunCursor | null {
  if (!/^[\w-]{1,250}$/.test(value)) return null;
  try {
    const cursor = JSON.parse(Buffer.from(value, "base64url").toString()) as RunCursor;
    if (cursor?.projectId !== projectId || typeof cursor.id !== "string" || !uuid.test(cursor.id) ||
        typeof cursor.timestamp !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/.test(cursor.timestamp))
      return null;
    const milliseconds = new Date(cursor.timestamp).toISOString();
    return milliseconds === cursor.timestamp.slice(0, 23) + "Z" ? cursor : null;
  } catch {
    return null;
  }
}
