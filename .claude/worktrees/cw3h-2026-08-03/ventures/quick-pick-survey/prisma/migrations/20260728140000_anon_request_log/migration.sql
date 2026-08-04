-- Per-IP counting for anonymous write endpoints (see src/lib/rateLimit.ts).
CREATE TABLE "AnonRequestLog" (
    "id" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnonRequestLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AnonRequestLog_ip_route_createdAt_idx" ON "AnonRequestLog"("ip", "route", "createdAt");
