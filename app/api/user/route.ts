import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "../auth/[...nextauth]/route";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function POST(request: NextRequest): Promise<NextResponse> {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return NextResponse.json({}, { status: 401 });
    }

    // TODO more validation
    const body = await request.json();
    if (!body.email) {
        return NextResponse.json({}, { status: 400 });
    }

    const newUser = await prisma.user.create({
        data: {
            email: body.email,
            userName: body.userName || undefined,
            responders: {
                create: {
                    requester: {
                        connect: {
                            email: session.user.email,
                        },
                    },
                },
            },
        },
    });

    return NextResponse.json({
        user: newUser,
    });
}
