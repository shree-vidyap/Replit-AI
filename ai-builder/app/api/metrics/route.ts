import { NextResponse } from "next/server";
import { metrics } from "@/lib/metrics";

// Prometheus scrape endpoint
export const dynamic = "force-dynamic";
export async function GET() {
  return new NextResponse(await metrics.registry.metrics(), {
    headers: { "Content-Type": metrics.registry.contentType },
  });
}
