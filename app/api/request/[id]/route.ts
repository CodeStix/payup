import { PrismaClient } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "../../auth/[...nextauth]/route";

const prisma = new PrismaClient();

export async function GET(request: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return NextResponse.json(undefined, { status: 401 });
    }

    const paymentRequest = await prisma.paymentRequest.findUnique({
        where: {
            id: params.id,
            owner: {
                email: session.user.email,
            },
        },
        include: {
            paidBy: {
                select: {
                    email: true,
                    id: true,
                    userName: true,
                    avatarUrl: true,
                },
            },
            usersToPay: {
                include: {
                    user: {
                        select: {
                            email: true,
                            id: true,
                            userName: true,
                            avatarUrl: true,
                        },
                    },
                },
            },
        },
    });

    return NextResponse.json(paymentRequest, { status: !paymentRequest ? 404 : 200 });
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return NextResponse.json({}, { status: 401 });
    }

    await prisma.paymentRequest.delete({
        where: {
            id: params.id,
            owner: {
                email: session.user.email,
            },
        },
    });

    return NextResponse.json({});
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return NextResponse.json({}, { status: 401 });
    }

    const body = (await request.json()) as {
        name: string;
        description: string;
        amount: number;
        paidBy?: {
            id: number;
        };
        usersToPay?: {
            user: {
                id: number;
            };
            partsOfAmount?: number;
            payedAmount?: number;
        }[];
    };

    const newRequest = await prisma.paymentRequest.update({
        where: {
            id: params.id,
            owner: {
                email: session.user.email,
            },
        },
        data: {
            description: body.description || "",
            name: body.name || undefined,
            paidById: body.paidBy?.id || undefined,
            amount: body.amount || undefined,
            usersToPay: body.usersToPay
                ? {
                      upsert: body.usersToPay.map((u) => ({
                          where: {
                              userId_paymentRequestId: {
                                  paymentRequestId: params.id,
                                  userId: u.user.id,
                              },
                          },
                          update: {
                              partsOfAmount: u.partsOfAmount || 1,
                              paymentComplete: false, // Maybe it got updated, recheck it during next cron job
                              payedAmount: u.payedAmount || undefined,
                          },
                          create: {
                              userId: u.user.id,
                              partsOfAmount: u.partsOfAmount || 1,
                              paymentComplete: false,
                              payedAmount: 0,
                          },
                      })),
                  }
                : {},
        },
        include: {
            paidBy: {
                select: {
                    email: true,
                    id: true,
                    userName: true,
                    avatarUrl: true,
                },
            },
            usersToPay: {
                include: {
                    user: {
                        select: {
                            email: true,
                            id: true,
                            userName: true,
                            avatarUrl: true,
                        },
                    },
                },
                orderBy: [{ payedAmount: "asc" }, { userId: "asc" }],
            },
        },
    });

    if (body.usersToPay) {
        const toDelete = new Set(newRequest.usersToPay.map((e) => e.userId));
        body.usersToPay.forEach((e) => toDelete.delete(e.user.id));

        await prisma.paymentRequestToUser.deleteMany({
            where: {
                userId: {
                    in: Array.from(toDelete),
                },
            },
        });
    }

    return NextResponse.json({ request: newRequest });
}
