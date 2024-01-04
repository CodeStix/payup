import { PrismaClient, User } from "@prisma/client";
import AWS from "aws-sdk";
import jwt from "jsonwebtoken";
import fs from "fs/promises";
import { htmlToText } from "html-to-text";
import { getUserDisplayName } from "./util";

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

/*export async function calculateOwingUsers() {
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
}*/

export type JwtPayload = {
    // User id that should receive money
    r: number;
    // User id that currently holds their money
    h: number;
    // Original amount calculated during creation
    o: number;
};

export function generateJwt(payload: JwtPayload) {
    return jwt.sign(payload, JWT_SECRET!, { expiresIn: 60 * 60 * 24 * 30 });
}

export async function generatePaymentLink(holder: number, receiver: number, amount: number) {
    const jwtPayload: JwtPayload = {
        r: receiver,
        h: holder,
        o: amount,
    };

    // const link = await prisma.paymentLink.create({
    //     data: {
    //         amount: amount,
    //         sendingUserId: paidBy.id,
    //         receivingUserId: ows.id,
    //         amountPerPaymentRequest: paidPaymentsRequests,
    //         paymentMethod: paidBy.mollieApiKey ? "mollie" : "iban",
    //         paid: false,
    //     },
    // });

    const jwtString = generateJwt(jwtPayload);
    return `${SERVER_URL}/pay/${encodeURIComponent(jwtString)}`;
    // return `${SERVER_URL}/pay/${encodeURIComponent(link.id)}`;
}

export function getEmailHtml(template: string, fields: Record<string, string>) {
    for (let field in fields) {
        template = template.replaceAll(`%${field}%`, fields[field]);
    }

    return template;
}

export async function notifyUsers() {
    // const owingUserPairs = await calculateOwingUsers();

    const emailTemplateString = await fs.readFile(EMAIL_TEMPLATE_PATH, { encoding: "utf-8" });

    const balances = await prisma.relativeUserBalance.findMany({
        where: {
            amount: {
                not: 0,
            },
        },
        select: {
            amount: true,
            moneyHolder: {
                select: {
                    id: true,
                    email: true,
                    userName: true,
                },
            },
            moneyReceiver: {
                select: {
                    id: true,
                    email: true,
                    userName: true,
                },
            },
            lastRelatingPaymentRequest: {
                select: {
                    name: true,
                },
            },
        },
    });

    const pairs = new Map<string, (typeof balances)[number]>();
    for (const balance of balances) {
        pairs.set(`${balance.moneyHolder.id}->${balance.moneyReceiver.id}`, balance);
    }

    for (const balance of balances) {
        const otherWayBalance = pairs.get(`${balance.moneyReceiver.id}->${balance.moneyHolder.id}`);

        console.log("bal", balance, otherWayBalance);

        if (balance.amount < 0) {
            console.warn("A balance is negative", balance);
        }

        const owsAmount = otherWayBalance ? balance.amount - otherWayBalance.amount : balance.amount;
        if (owsAmount <= 0) {
            // Ows the other way around or doesn't owe anything, skip
            continue;
        }

        const paymentLink = await generatePaymentLink(balance.moneyHolder.id, balance.moneyReceiver.id, owsAmount);

        console.log(balance.moneyHolder.email, "should send money to", balance.moneyReceiver.email, "=", owsAmount, paymentLink);

        await sendMail(
            balance.moneyHolder.email,
            `You still owe ${getUserDisplayName(balance.moneyReceiver)} money, pay up!`,
            getEmailHtml(emailTemplateString, {
                paymentLink,
                userName: getUserDisplayName(balance.moneyHolder),
                paidByUserName: getUserDisplayName(balance.moneyReceiver),
                paidByEmail: balance.moneyReceiver.email,
                description:
                    (balance.lastRelatingPaymentRequest?.name ?? "an unknown reason") +
                    (otherWayBalance
                        ? ` and ${getUserDisplayName(balance.moneyReceiver)} still ows you for ${
                              otherWayBalance.lastRelatingPaymentRequest?.name ?? "an unknown reason"
                          }`
                        : ""),
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
