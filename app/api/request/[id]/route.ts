import { PrismaClient } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "../../auth/[...nextauth]/route";

const prisma = new PrismaClient();

export async function GET(request: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return NextResponse.json({}, { status: 401 });
    }

    const r = await prisma.paymentRequest.findUnique({
        where: {
            id: params.id,
            owner: {
                email: session.user.email,
            },
        },
        include: {
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

    return NextResponse.json(r, { status: !r ? 404 : 200 });
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
        usersToPay?: {
            id: number;
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
            description: body.description,
            name: body.name,
            usersToPay: body.usersToPay
                ? {
                      connectOrCreate: body.usersToPay.map((u) => ({
                          where: {
                              userId_paymentRequestId: {
                                  paymentRequestId: params.id,
                                  userId: u.id,
                              },
                          },
                          create: {
                              userId: u.id,
                          },
                      })),
                  }
                : {},
        },
        include: {
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

    if (body.usersToPay) {
        const toDelete = new Set(newRequest.usersToPay.map((e) => e.userId));
        body.usersToPay.forEach((e) => toDelete.delete(e.id));

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
