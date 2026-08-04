import { NextResponse } from "next/server";
import { requireOperator } from "@/lib/api-auth";
import {
  predictCustomsClearanceAging,
  summarizeCustomsAgingBatch,
  persistCustomsAgingRecord,
  type InternationalShipment,
} from "@/lib/customs-clearance-aging";

export async function POST(request: Request) {
  const denied = requireOperator(request);
  if (denied) return denied;

  try {
    const body = await request.json();
    const { shipment, shipments } = body;

    if (shipments && Array.isArray(shipments)) {
      const summary = summarizeCustomsAgingBatch(shipments as InternationalShipment[]);
      return NextResponse.json({ success: true, summary });
    }

    if (!shipment) {
      return NextResponse.json({ error: "Missing shipment or shipments data" }, { status: 400 });
    }

    const prediction = predictCustomsClearanceAging(shipment as InternationalShipment);
    const record = persistCustomsAgingRecord(prediction);

    return NextResponse.json({
      success: true,
      prediction,
      persistedRecordId: record.recordId,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to evaluate customs clearance aging", details: error.message },
      { status: 500 }
    );
  }
}
