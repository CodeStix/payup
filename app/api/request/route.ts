import { PrismaClient } from "@prisma/client";
import { getServerSession } from "next-auth/next";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/authOptions";

const prisma = new PrismaClient();

export async function POST(request: NextRequest): Promise<NextResponse> {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
        return NextResponse.json({}, { status: 401 });
    }

    const body = await request.json();

    const newRequest = await prisma.paymentRequest.create({
        data: {
            name: body.name || "",
            description: body.description || "",
            published: false,
            owner: {
                connect: {
                    email: session.user.email,
                },
            },
            paidBy: {
                connect: {
                    email: session.user.email,
                },
            },
        },
    });

    return NextResponse.json({
        request: newRequest,
    });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
        return NextResponse.json({}, { status: 401 });
    }

    const requests = await prisma.paymentRequest.findMany({
        where: {
            owner: {
                email: session.user.email,
            },
        },
        select: {
            name: true,
            description: true,
            id: true,
            createdDate: true,
            amount: true,
            paidBy: {
                select: {
                    email: true,
                    userName: true,
                    id: true,
                    avatarUrl: true,
                },
            },
            usersToPay: {
                select: {
                    partsOfAmount: true,
                    user: {
                        select: {
                            id: true,
                            email: true,
                            avatarUrl: true,
                            userName: true,
                        },
                    },
                },
            },
        },
        orderBy: {
            createdDate: "desc",
        },
    });

    return NextResponse.json({
        requests,
    });
}
