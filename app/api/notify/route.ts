import { notifyPaymentReminders, notifyUsers } from "@/notifications";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest): Promise<NextResponse> {
    if (!process.env.NOTIFY_SECRET || request.headers.get("Authorization") !== process.env.NOTIFY_SECRET) {
        return NextResponse.json(null, { status: 404 });
    }

    await notifyUsers(request.nextUrl.searchParams.get("all") === "1");
    await notifyPaymentReminders(request.nextUrl.searchParams.get("allReminders") === "1");

    return NextResponse.json({});
}
