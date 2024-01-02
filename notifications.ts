import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function notifyUsers() {
    const payingUserOpenRequests = await prisma.paymentRequestToUser.findMany({
        where: {
            paymentComplete: false,
        },
        select: {
            userId: true,
            partsOfAmount: true,
            lastNotificationDate: true,
            payedAmount: true,
            paymentRequest: {
                select: {
                    id: true,
                    paidById: true,
                    amount: true,
                },
            },
        },
    });

    const partsPerRequest = new Map<string, number>();

    for (const paymentPerUser of payingUserOpenRequests) {
        const paymentRequestId = paymentPerUser.paymentRequest.id;
        partsPerRequest.set(paymentRequestId, (partsPerRequest.get(paymentRequestId) ?? 0) + paymentPerUser.partsOfAmount);
    }

    const balancePerUserPair = new Map<string, { owsId: number; paidById: number; amount: number }>();

    for (const paymentPerUser of payingUserOpenRequests) {
        const partsInRequest = partsPerRequest.get(paymentPerUser.paymentRequest.id)!;
        const paidById = paymentPerUser.paymentRequest.paidById;
        const owsId = paymentPerUser.userId;

        const stillOws = (paymentPerUser.partsOfAmount / partsInRequest) * paymentPerUser.paymentRequest.amount - paymentPerUser.payedAmount;

        const settled = Math.abs(stillOws) < 0.01;
        if (settled) {
            console.log("Settled", owsId, "->", paidById);
            await prisma.paymentRequestToUser.update({
                where: {
                    userId_paymentRequestId: {
                        userId: paymentPerUser.userId,
                        paymentRequestId: paymentPerUser.paymentRequest.id,
                    },
                },
                data: {
                    paymentComplete: true,
                },
            });
        } else {
            console.log("Should still pay", owsId, "->", paidById, "=", stillOws);

            const userPairKey = `${owsId}->${paidById}`;
            if (balancePerUserPair.has(userPairKey)) {
                const current = balancePerUserPair.get(userPairKey)!;
                current.amount += stillOws;
            } else {
                const invertedUserPairKey = `${paidById}->${owsId}`;
                if (balancePerUserPair.has(invertedUserPairKey)) {
                    const current = balancePerUserPair.get(invertedUserPairKey)!;
                    current.amount -= stillOws;
                } else {
                    balancePerUserPair.set(userPairKey, {
                        amount: stillOws,
                        owsId: owsId,
                        paidById: paidById,
                    });
                }
            }
        }
    }

    for (const owing of Array.from(balancePerUserPair.values())) {
        console.log(owing.owsId, "ows", owing.paidById, "amount", owing.amount);
    }
}
