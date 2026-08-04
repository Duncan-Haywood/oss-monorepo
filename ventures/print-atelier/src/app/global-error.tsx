'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body>
        <div style={{ padding: '4rem', textAlign: 'center', fontFamily: 'sans-serif' }}>
          <h2>500 - Application Error</h2>
          <p>An unexpected error occurred: {error.message}</p>
          <button onClick={() => reset()} style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
