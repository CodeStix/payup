import { calculateOwingUsers, notifyUsers } from "@/notifications";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest): Promise<NextResponse> {
    if (!process.env.NOTIFY_SECRET || request.headers.get("Authorization") !== process.env.NOTIFY_SECRET) {
        return NextResponse.json(null, { status: 404 });
    }

    await notifyUsers();
    return NextResponse.json({});
}
