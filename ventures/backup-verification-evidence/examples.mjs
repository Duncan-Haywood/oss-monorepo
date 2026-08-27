/** Four nightly run records. The last night is still "verified" but 76% smaller. */

export const TREND_EXAMPLE_NIGHTS = [
  {
    tool: "pg_dump|gzip",
    exit_code: 0,
    started_at: "2026-08-21T03:00:00Z",
    finished_at: "2026-08-21T03:04:00Z",
    artifact: {
      exists: true,
      size_bytes: 50_000_000,
      modified_at: "2026-08-21T03:03:50Z",
    },
    expected: { min_size_bytes: 1_000_000, max_age_hours: 26 },
  },
  {
    tool: "pg_dump|gzip",
    exit_code: 0,
    started_at: "2026-08-22T03:00:00Z",
    finished_at: "2026-08-22T03:04:00Z",
    artifact: {
      exists: true,
      size_bytes: 51_200_000,
      modified_at: "2026-08-22T03:03:50Z",
    },
    expected: { min_size_bytes: 1_000_000, max_age_hours: 26 },
  },
  {
    tool: "pg_dump|gzip",
    exit_code: 0,
    started_at: "2026-08-23T03:00:00Z",
    finished_at: "2026-08-23T03:04:00Z",
    artifact: {
      exists: true,
      size_bytes: 50_400_000,
      modified_at: "2026-08-23T03:03:50Z",
    },
    expected: { min_size_bytes: 1_000_000, max_age_hours: 26 },
  },
  {
    tool: "pg_dump|gzip",
    exit_code: 0,
    started_at: "2026-08-24T03:00:00Z",
    finished_at: "2026-08-24T03:04:00Z",
    artifact: {
      exists: true,
      size_bytes: 12_000_000,
      modified_at: "2026-08-24T03:03:50Z",
    },
    expected: { min_size_bytes: 1_000_000, max_age_hours: 26 },
  },
];
