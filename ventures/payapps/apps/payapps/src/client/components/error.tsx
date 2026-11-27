import { errorMessage } from "../lib/api";

export function ErrorText({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p role="alert" className="text-sm text-red-700">
      {errorMessage(error)}
    </p>
  );
}
