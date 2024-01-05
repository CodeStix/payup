import { PaymentRequestToUser, PrismaClient, PaymentRequest, PrismaPromise } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/authOptions";
import { calculateUserAmount, getTotalParts } from "@/util";

const prisma = new PrismaClient();

export async function GET(request: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return NextResponse.json(null, { status: 401 });
    }

    let paymentRequest = await prisma.paymentRequest.findUnique({
        where: {
            id: params.id,
            owner: {
                email: session.user.email,
            },
        },
        select: { paidById: true },
    });

    if (!paymentRequest) {
        return NextResponse.json(null, { status: 404 });
    }

    paymentRequest = await prisma.paymentRequest.findUnique({
        where: {
            id: params.id,
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
                            holdsMoneyFrom: {
                                where: {
                                    moneyReceiverId: paymentRequest.paidById,
                                },
                                select: {
                                    amount: true,
                                    lastPaymentDate: true,
                                },
                            },
                            shouldReceiveMoneyFrom: {
                                where: {
                                    moneyHolderId: paymentRequest.paidById,
                                },
                                select: {
                                    amount: true,
                                    lastPaymentDate: true,
                                },
                            },
                        },
                    },
                },
            },
        },
    });

    // console.log("payment request", paymentRequest);

    return NextResponse.json(paymentRequest);
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return NextResponse.json({}, { status: 401 });
    }

    await prisma.$transaction(async (prisma) => {
        const deletedRequest = await prisma.paymentRequest.delete({
            where: {
                id: params.id,
                owner: {
                    email: session.user!.email!,
                },
            },
            include: {
                usersToPay: {
                    include: {
                        user: true,
                    },
                },
            },
        });

        const totalParts = getTotalParts(deletedRequest.usersToPay);

        for (const userToPay of deletedRequest.usersToPay) {
            const deletedAmountToPay = calculateUserAmount(totalParts, deletedRequest.amount, userToPay.partsOfAmount!);

            await prisma.relativeUserBalance.upsert({
                where: {
                    moneyHolderId_moneyReceiverId: {
                        moneyReceiverId: userToPay.userId!,
                        moneyHolderId: deletedRequest.paidById,
                    },
                },
                update: {
                    amount: {
                        increment: deletedAmountToPay,
                    },
                },
                create: {
                    moneyReceiverId: userToPay.userId!,
                    moneyHolderId: deletedRequest.paidById,
                    amount: 0,
                },
            });
        }
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
        paidById?: number;
        usersToPay?: {
            userId: number;
            partsOfAmount?: number;
        }[];
    };

    const existingRequest = await prisma.paymentRequest.findUnique({
        where: {
            id: params.id,
            owner: {
                email: session.user.email,
            },
        },
        select: {
            paidById: true,
            amount: true,
            usersToPay: {
                select: {
                    userId: true,
                    user: {
                        select: {
                            id: true,
                        },
                    },
                    partsOfAmount: true,
                },
            },
        },
    });

    if (!existingRequest) {
        return NextResponse.json(undefined, { status: 404 });
    }

    let prismaOperations: PrismaPromise<any>[] = [];

    function getCompositeKey(holderId: number, receiverId: number) {
        return `${holderId}->${receiverId}`;
    }

    // Calculate balance differences between users
    const existingUsersToPay = new Map<string, Partial<PaymentRequestToUser>>(
        existingRequest.usersToPay.map((e) => [getCompositeKey(e.userId, existingRequest.paidById), e])
    );
    const existingTotalParts = getTotalParts(existingRequest.usersToPay);

    const bodyPaidById = body.paidById ?? existingRequest.paidById;
    const bodyUsersToPay = new Map<string, Partial<PaymentRequestToUser>>(
        (body.usersToPay ?? existingRequest.usersToPay).map((e) => [
            getCompositeKey(e.userId, bodyPaidById),
            { ...existingUsersToPay.get(getCompositeKey(e.userId, bodyPaidById)), ...e },
        ])
    );
    const bodyTotalParts = getTotalParts((body.usersToPay ?? existingRequest.usersToPay) as { partsOfAmount: number }[]);

    // console.log("existingUsersToPay", Array.from(existingUsersToPay.values()));
    // console.log("bodyUsersToPay", Array.from(bodyUsersToPay.values()));

    for (const [bodyUserToPayId, bodyUserToPay] of Array.from(bodyUsersToPay.entries())) {
        // console.log(
        //     "calculateUserAmount(bodyTotalParts, body.amount, bodyUserToPay.partsOfAmount!)",
        //     bodyTotalParts,
        //     body.amount,
        //     bodyUserToPay.partsOfAmount!
        // );
        const bodyAmount = calculateUserAmount(bodyTotalParts, body.amount ?? existingRequest.amount, bodyUserToPay.partsOfAmount!);

        const existingUserToPay = existingUsersToPay.get(bodyUserToPayId);
        if (existingUserToPay) {
            // console.log(
            //     "calculateUserAmount(existingTotalParts, existingRequest.amount, existingUserToPay.partsOfAmount!)",
            //     existingTotalParts,
            //     existingRequest.amount,
            //     existingUserToPay.partsOfAmount
            // );
            const existingAmount = calculateUserAmount(existingTotalParts, existingRequest.amount, existingUserToPay.partsOfAmount!);
            const diff = bodyAmount - existingAmount;
            if (diff !== 0) {
                // Was adjusted
                // if (diff >= 0) console.log("Adjusted", [bodyPaidById, bodyUserToPay.userId!], "increment", Math.abs(diff));
                // else console.log("Adjusted", [bodyUserToPay.userId!, bodyPaidById], "increment", Math.abs(diff));

                prismaOperations.push(
                    prisma.relativeUserBalance.upsert({
                        where: {
                            moneyHolderId_moneyReceiverId: {
                                moneyReceiverId: diff >= 0 ? bodyPaidById : bodyUserToPay.userId!,
                                moneyHolderId: diff >= 0 ? bodyUserToPay.userId! : bodyPaidById,
                            },
                        },
                        update: {
                            amount: {
                                increment: Math.abs(diff),
                            },
                            lastRelatingPaymentRequestId: params.id,
                        },
                        create: {
                            moneyReceiverId: diff >= 0 ? bodyPaidById : bodyUserToPay.userId!,
                            moneyHolderId: diff >= 0 ? bodyUserToPay.userId! : bodyPaidById,
                            amount: diff >= 0 ? bodyAmount : Math.abs(diff),
                            lastRelatingPaymentRequestId: params.id,
                        },
                    })
                );
            }
        } else {
            // New was added
            // console.log("Added", [bodyPaidById, bodyUserToPay.userId!], "increment", bodyAmount);

            prismaOperations.push(
                prisma.relativeUserBalance.upsert({
                    where: {
                        moneyHolderId_moneyReceiverId: {
                            moneyReceiverId: bodyPaidById,
                            moneyHolderId: bodyUserToPay.userId!,
                        },
                    },
                    update: {
                        amount: {
                            increment: bodyAmount,
                        },
                        lastRelatingPaymentRequestId: params.id,
                    },
                    create: {
                        moneyReceiverId: bodyPaidById,
                        moneyHolderId: bodyUserToPay.userId!,
                        amount: bodyAmount,
                        lastRelatingPaymentRequestId: params.id,
                    },
                })
            );
        }

        existingUsersToPay.delete(bodyUserToPayId);
    }

    for (const [, deletedUserToPay] of Array.from(existingUsersToPay.entries())) {
        // Was removed, remove from balance
        // console.log(
        //     "calculateUserAmount(bodyTotalParts, body.amount ?? existingRequest.amount, deletedUserToPay.partsOfAmount!)",
        //     bodyTotalParts,
        //     body.amount ?? existingRequest.amount,
        //     deletedUserToPay.partsOfAmount!
        // );

        const deletedAmountToPay = calculateUserAmount(existingTotalParts, existingRequest.amount, deletedUserToPay.partsOfAmount!);
        // console.log("Deleted", [existingRequest.paidById, deletedUserToPay.userId!], "decrement", deletedAmountToPay);

        prismaOperations.push(
            prisma.relativeUserBalance.upsert({
                where: {
                    moneyHolderId_moneyReceiverId: {
                        // moneyReceiverId: existingRequest.paidById,
                        // moneyHolderId: deletedUserToPay.userId!,
                        moneyReceiverId: deletedUserToPay.userId!,
                        moneyHolderId: existingRequest.paidById,
                    },
                },
                update: {
                    amount: {
                        // decrement: deletedAmountToPay,
                        increment: deletedAmountToPay,
                    },
                    lastRelatingPaymentRequestId: params.id,
                },
                create: {
                    // moneyReceiverId: existingRequest.paidById,
                    // moneyHolderId: deletedUserToPay.userId!,
                    moneyReceiverId: deletedUserToPay.userId!,
                    moneyHolderId: existingRequest.paidById,
                    amount: 0,
                },
            })
        );
    }

    if (body.usersToPay) {
        // Remove usersToPay from database that were removed from body
        const toDelete = new Set(existingRequest.usersToPay.map((e) => e.userId));
        body.usersToPay.forEach((e) => toDelete.delete(e.userId));

        if (toDelete.size > 0) {
            prismaOperations.push(
                prisma.paymentRequestToUser.deleteMany({
                    where: {
                        userId: {
                            in: Array.from(toDelete),
                        },
                    },
                })
            );
        }
    }

    prismaOperations.push(
        prisma.paymentRequest.update({
            where: {
                id: params.id,
                owner: {
                    email: session.user.email,
                },
            },
            data: {
                description: body.description || "",
                name: body.name || undefined,
                paidById: bodyPaidById,
                amount: body.amount || undefined,
                usersToPay: body.usersToPay
                    ? {
                          upsert: body.usersToPay.map((u) => ({
                              where: {
                                  userId_paymentRequestId: {
                                      paymentRequestId: params.id,
                                      userId: u.userId,
                                  },
                              },
                              update: {
                                  partsOfAmount: u.partsOfAmount || 1,
                              },
                              create: {
                                  userId: u.userId,
                                  partsOfAmount: u.partsOfAmount || 1,
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
                                holdsMoneyFrom: {
                                    where: {
                                        moneyReceiverId: bodyPaidById,
                                    },
                                    select: {
                                        amount: true,
                                        lastPaymentDate: true,
                                    },
                                },
                                shouldReceiveMoneyFrom: {
                                    where: {
                                        moneyHolderId: bodyPaidById,
                                    },
                                    select: {
                                        amount: true,
                                        lastPaymentDate: true,
                                    },
                                },
                            },
                        },
                    },
                    orderBy: [{ createdDate: "asc" }],
                },
            },
        })
    );

    let newRequest: PaymentRequest;
    try {
        const res = await prisma.$transaction(prismaOperations);
        // console.log("res", res);
        newRequest = res[res.length - 1];
    } catch (ex) {
        console.error("Could not update request", ex);
        return NextResponse.json(undefined, { status: 500 });
    }

    if (body.usersToPay) {
        // Create friending users
        const currentUser = await prisma.user.findUniqueOrThrow({
            where: {
                email: session.user.email,
            },
            select: {
                id: true,
            },
        });
        await prisma.userToUser.createMany({
            skipDuplicates: true,
            data: body.usersToPay.map((e) => ({ requesterId: currentUser.id, responderId: e.userId })),
        });
    }

    return NextResponse.json({ request: newRequest });
}
