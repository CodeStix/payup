import { PrismaClient, User } from "@prisma/client";
import AWS, { SES } from "aws-sdk";

const prisma = new PrismaClient();

const { AWS_REGION, AWS_SES_KEY, AWS_SES_SECRET, AWS_SES_SOURCE } = process.env;

AWS.config.update({
    region: AWS_REGION,
    credentials: {
        accessKeyId: AWS_SES_KEY!,
        secretAccessKey: AWS_SES_SECRET!,
    },
});

let ses = new AWS.SES();

export async function calculateOwingUsers() {
    const payingUserOpenRequests = await prisma.paymentRequestToUser.findMany({
        where: {
            paymentComplete: false,
        },
        select: {
            user: {
                select: {
                    id: true,
                    email: true,
                },
            },
            partsOfAmount: true,
            lastNotificationDate: true,
            payedAmount: true,
            paymentRequest: {
                select: {
                    id: true,
                    paidBy: {
                        select: {
                            id: true,
                            email: true,
                        },
                    },
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

    const balancePerUserPair = new Map<string, { ows: User; paidBy: User; amount: number }>();

    for (const paymentPerUser of payingUserOpenRequests) {
        const partsInRequest = partsPerRequest.get(paymentPerUser.paymentRequest.id)!;
        const paidById = paymentPerUser.paymentRequest.paidBy.id;
        const owsId = paymentPerUser.user.id;

        const stillOws = (paymentPerUser.partsOfAmount / partsInRequest) * paymentPerUser.paymentRequest.amount - paymentPerUser.payedAmount;

        const settled = Math.abs(stillOws) < 0.01;
        if (settled) {
            console.log("Settled", owsId, "->", paidById);
            await prisma.paymentRequestToUser.update({
                where: {
                    userId_paymentRequestId: {
                        userId: paymentPerUser.user.id,
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
                        ows: paymentPerUser.user as User,
                        paidBy: paymentPerUser.paymentRequest.paidBy as User,
                    });
                }
            }
        }
    }

    for (const owing of Array.from(balancePerUserPair.values())) {
        console.log(owing.ows.email, "ows", owing.paidBy.email, "amount", owing.amount);
    }

    return Array.from(balancePerUserPair.values());
}

export async function notifyUsers() {
    let owing = await calculateOwingUsers();

    for (let o of owing) {
        if (o.amount >= 0) {
            await sendMail(o.ows.email, `You still owe ${o.paidBy.userName} money, pay up!`, "");
        } else {
            await sendMail(o.paidBy.email, `You still owe ${o.ows.userName} money, pay up!`, "");
        }
    }
}

async function sendMail(receiver: string, subject: string, body: string) {
    if (receiver === "reddusted@gmail.com" || receiver === "stijn.rogiest@gmail.com")
        await ses
            .sendEmail({
                Destination: {
                    ToAddresses: [receiver],
                },
                Message: {
                    Body: {
                        // Html: {

                        // },
                        Text: {
                            Data: body,
                        },
                    },
                    Subject: {
                        Data: subject,
                    },
                },
                Source: AWS_SES_SOURCE!,
            })
            .promise()
            .then((e) => {
                console.log("Sent mail to", receiver);
            });
    else console.warn("Sent email to (skipped)", receiver);
}
