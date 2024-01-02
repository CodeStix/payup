import { calculateOwingUsers, notifyUsers } from "@/notifications";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest): Promise<NextResponse> {
    await notifyUsers();
    return NextResponse.json({});
}
