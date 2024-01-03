import { PrismaClient, User } from "@prisma/client";
import AWS from "aws-sdk";
import jwt from "jsonwebtoken";
import fs from "fs/promises";
import { htmlToText } from "html-to-text";

const prisma = new PrismaClient();

const EMAIL_TEMPLATE_PATH = "email/template.html";

const { AWS_REGION, AWS_SES_KEY, AWS_SES_SECRET, AWS_SES_SOURCE, JWT_SECRET, SERVER_URL } = process.env;

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
                    userName: true,
                    iban: true,
                    mollieApiKey: true,
                },
            },
            partsOfAmount: true,
            lastNotificationDate: true,
            payedAmount: true,
            paymentRequest: {
                select: {
                    id: true,
                    name: true,
                    paidBy: {
                        select: {
                            id: true,
                            userName: true,
                            email: true,
                            iban: true,
                            mollieApiKey: true,
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

    const balancePerUserPair = new Map<
        string,
        {
            ows: User;
            paidBy: User;
            amount: number;
            settlesPaymentsRequests: { paymentRequestId: string; userId: number; amount: number; name: string }[];
        }
    >();

    for (const paymentPerUser of payingUserOpenRequests) {
        const partsInRequest = partsPerRequest.get(paymentPerUser.paymentRequest.id)!;
        const paidById = paymentPerUser.paymentRequest.paidBy.id;
        const owsId = paymentPerUser.user.id;

        const shouldPayAmount = (paymentPerUser.partsOfAmount / partsInRequest) * paymentPerUser.paymentRequest.amount;
        const stillOws = shouldPayAmount - paymentPerUser.payedAmount;

        const settled = paidById === owsId || Math.abs(stillOws) < 0.01;
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
                    payedAmount: shouldPayAmount,
                },
            });
        } else {
            // console.log("Should still pay", owsId, "->", paidById, "=", stillOws);

            const userPairKey = `${owsId}->${paidById}`;
            if (balancePerUserPair.has(userPairKey)) {
                const current = balancePerUserPair.get(userPairKey)!;
                current.amount += stillOws;
                current.settlesPaymentsRequests.push({
                    paymentRequestId: paymentPerUser.paymentRequest.id,
                    userId: paymentPerUser.user.id,
                    amount: stillOws,
                    name: paymentPerUser.paymentRequest.name,
                });
            } else {
                const invertedUserPairKey = `${paidById}->${owsId}`;
                if (balancePerUserPair.has(invertedUserPairKey)) {
                    const current = balancePerUserPair.get(invertedUserPairKey)!;
                    current.amount -= stillOws;
                    current.settlesPaymentsRequests.push({
                        paymentRequestId: paymentPerUser.paymentRequest.id,
                        userId: paymentPerUser.user.id,
                        amount: stillOws,
                        name: paymentPerUser.paymentRequest.name,
                    });
                } else {
                    balancePerUserPair.set(userPairKey, {
                        amount: stillOws,
                        ows: paymentPerUser.user as User,
                        paidBy: paymentPerUser.paymentRequest.paidBy as User,
                        settlesPaymentsRequests: [
                            {
                                paymentRequestId: paymentPerUser.paymentRequest.id,
                                userId: paymentPerUser.user.id,
                                amount: stillOws,
                                name: paymentPerUser.paymentRequest.name,
                            },
                        ],
                    });
                }
            }
        }
    }

    // for (const owing of Array.from(balancePerUserPair.values())) {
    //     console.log(owing.ows.email, "ows", owing.paidBy.email, "amount", owing.amount);
    // }

    return Array.from(balancePerUserPair.values());
}

// export type JwtPayload = {
//     method: "iban";
//     paidBy: Partial<User>;
//     user: Partial<User>;
//     amount: number;
//     // settlesPaymentsRequests
//     paid: [paymentRequestId: string, amount: number][];
// };

export async function generatePaymentLink(
    ows: User,
    paidBy: User,
    amount: number,
    paidPaymentsRequests: { paymentRequestId: string; amount: number; userId: number }[]
) {
    // const jwtPayload: JwtPayload = {
    //     method: "iban",
    //     paidBy: {
    //         id: paidBy.id,
    //     },
    //     user: {
    //         id: ows.id,
    //     },
    //     amount: amount,
    //     paid: paidPaymentsRequests,
    // };

    const link = await prisma.paymentLink.create({
        data: {
            amount: amount,
            sendingUserId: paidBy.id,
            receivingUserId: ows.id,
            amountPerPaymentRequest: paidPaymentsRequests,
            paymentMethod: paidBy.mollieApiKey ? "mollie" : "iban",
            paid: false,
        },
    });

    // const jwtString = jwt.sign(jwtPayload, JWT_SECRET!, { expiresIn: 60 * 60 * 24 * 30 });
    return `${SERVER_URL}/pay/${encodeURIComponent(link.id)}`;
}

export function getEmailHtml(template: string, fields: Record<string, string>) {
    for (let field in fields) {
        template = template.replaceAll(`%${field}%`, fields[field]);
    }

    return template;
}

export async function notifyUsers() {
    const owingUserPairs = await calculateOwingUsers();

    const emailTemplateString = await fs.readFile(EMAIL_TEMPLATE_PATH, { encoding: "utf-8" });

    for (let userPair of owingUserPairs) {
        const amount = Math.abs(userPair.amount);
        const ows = userPair.amount >= 0 ? userPair.ows : userPair.paidBy;
        const paidBy = userPair.amount >= 0 ? userPair.paidBy : userPair.ows;

        const paymentLink = await generatePaymentLink(ows, paidBy, amount, userPair.settlesPaymentsRequests);

        console.log(ows.email, "ows", paidBy.email, amount, paymentLink);

        await sendMail(
            ows.email,
            `You still owe ${paidBy.userName} money, pay up!`,
            getEmailHtml(emailTemplateString, {
                paymentLink,
                userName: ows.userName || ows.email,
                paidByUserName: paidBy.userName || paidBy.email,
                paidByEmail: paidBy.email,
                description: userPair.settlesPaymentsRequests.map((e) => e.name).join(", "),
            })
        );
    }
}

async function sendMail(receiver: string, subject: string, body: string) {
    // if (receiver === "reddusted@gmail.com" || receiver === "stijn.rogiest@gmail.com")
    await ses
        .sendEmail({
            Destination: {
                ToAddresses: [receiver],
            },
            Message: {
                Body: {
                    Html: {
                        Data: body,
                    },
                    Text: {
                        Data: htmlToText(body),
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
    // else console.warn("Sent email to (skipped)", receiver, subject);
}
