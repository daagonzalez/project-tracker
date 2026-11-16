import { ApiError } from "../api/client";

/** Shows the server's message for an API error (or a generic one), as an alert. */
export function ErrorNote({ error, fallback = "Something went wrong" }: { error: unknown; fallback?: string }) {
  if (!error) return null;
  return (
    <p role="alert" className="mt-2 text-sm text-red-700">
      {error instanceof ApiError ? error.message : fallback}
    </p>
  );
}
