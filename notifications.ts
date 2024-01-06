import { PrismaClient, User } from "@prisma/client";
import AWS from "aws-sdk";
import jwt from "jsonwebtoken";
import fs from "fs/promises";
import { htmlToText } from "html-to-text";
import { getUserDisplayName } from "./util";

const prisma = new PrismaClient();

const EMAIL_TEMPLATE_PATH = "email/template.html";
const REMINDER_EMAIL_TEMPLATE_PATH = "email/reminder-template.html";

const { AWS_REGION, AWS_SES_KEY, AWS_SES_SECRET, AWS_SES_SOURCE, JWT_SECRET, SERVER_URL } = process.env;

AWS.config.update({
    region: AWS_REGION,
    credentials: {
        accessKeyId: AWS_SES_KEY!,
        secretAccessKey: AWS_SES_SECRET!,
    },
});

let ses = new AWS.SES();

export type JwtPayloadReminder = {
    // Reminder id
    m: number;
};

export type JwtPayload = {
    // User id that should receive money
    r: number;
    // User id that currently holds their money
    h: number;
    // Original amount calculated during creation
    o: number;
};

export function generateJwt(payload: any) {
    return jwt.sign(payload, JWT_SECRET!, { expiresIn: 60 * 60 * 24 * 30 });
}

export async function generatePaymentLink(holder: number, receiver: number, amount: number) {
    const jwtPayload: JwtPayload = {
        r: receiver,
        h: holder,
        o: amount,
    };

    const jwtString = generateJwt(jwtPayload);
    return `${SERVER_URL}/pay/${encodeURIComponent(jwtString)}`;
}

export async function generatePaymentReminderLink(reminderId: number) {
    const jwtPayload: JwtPayloadReminder = {
        m: reminderId,
    };

    const jwtString = generateJwt(jwtPayload);
    return `${SERVER_URL}/reminder/${encodeURIComponent(jwtString)}`;
}

export function getEmailHtml(template: string, fields: Record<string, string>) {
    for (let field in fields) {
        template = template.replaceAll(`%${field}%`, fields[field]);
    }

    return template;
}

const NOTIFY_PAYMENT_REMINDER_INTERVAL_MS = parseInt(process.env.NOTIFY_PAYMENT_REMINDER_INTERVAL_MS || String(1000 * 60 * 60 * 24 * 4));
const NOTIFY_INTERVAL_MS = parseInt(process.env.NOTIFY_INTERVAL_MS || String(1000 * 60 * 60 * 24 * 2));

export async function notifyPaymentReminders(all: boolean) {
    const emailTemplateString = await fs.readFile(REMINDER_EMAIL_TEMPLATE_PATH, { encoding: "utf-8" });

    const notifyBefore = new Date(new Date().getTime() - NOTIFY_PAYMENT_REMINDER_INTERVAL_MS);

    const reminders = await prisma.paymentCheckReminder.findMany({
        where: all
            ? { opened: false }
            : {
                  opened: false,
                  OR: [
                      {
                          lastNotificationDate: {
                              lt: notifyBefore,
                          },
                      },
                      { lastNotificationDate: null },
                  ],
              },
        select: {
            moneyHolder: {
                select: {
                    id: true,
                    userName: true,
                    iban: true,
                    avatarUrl: true,
                    email: true,
                },
            },
            moneyReceiver: {
                select: {
                    id: true,
                    userName: true,
                    iban: true,
                    avatarUrl: true,
                    email: true,
                },
            },
            paidAmount: true,
            paidDate: true,
            id: true,
        },
    });

    console.log("Sending", reminders.length, "payment reminders");

    for (const reminder of reminders) {
        const remindLink = await generatePaymentReminderLink(reminder.id);

        try {
            await sendMail(
                reminder.moneyReceiver.email,
                `Did you receive ${reminder.paidAmount.toFixed(2)} from ${getUserDisplayName(reminder.moneyHolder)}? Please confirm`,
                getEmailHtml(emailTemplateString, {
                    receiverUserName: getUserDisplayName(reminder.moneyReceiver),
                    holderUserName: getUserDisplayName(reminder.moneyHolder),
                    amount: reminder.paidAmount.toFixed(2),
                    holderUserNameAndIban: reminder.moneyHolder.iban
                        ? `${getUserDisplayName(reminder.moneyHolder)} (${reminder.moneyHolder.iban})`
                        : getUserDisplayName(reminder.moneyHolder),
                    yesLink: remindLink + "?confirm=yes",
                    noLink: remindLink + "?confirm=no",
                    paidDate: reminder.paidDate.toLocaleString(),
                })
            );
        } catch (ex) {
            console.error("Could not send mail to", reminder.moneyReceiver.email, ex);
        }
    }

    await prisma.paymentCheckReminder.updateMany({
        where: {
            id: {
                in: reminders.map((e) => e.id),
            },
        },
        data: {
            lastNotificationDate: new Date(),
        },
    });
}

export async function notifyUsers(all: boolean) {
    const emailTemplateString = await fs.readFile(EMAIL_TEMPLATE_PATH, { encoding: "utf-8" });

    const notifyBefore = new Date(new Date().getTime() - NOTIFY_INTERVAL_MS);

    const condition = {
        amount: {
            not: 0,
        },
        ...(all
            ? {}
            : {
                  OR: [
                      {
                          lastNotificationDate: {
                              lt: notifyBefore,
                          },
                      },
                      { lastNotificationDate: null },
                  ],
              }),
    };

    const balances = await prisma.relativeUserBalance.findMany({
        where: condition,
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

    console.log("Found", balances.length, "balances to notify about", all ? "(all)" : "(timed)");

    await prisma.relativeUserBalance.updateMany({
        where: condition,
        data: {
            lastNotificationDate: new Date(),
        },
    });

    const pairs = new Map<string, (typeof balances)[number]>();
    for (const balance of balances) {
        pairs.set(`${balance.moneyHolder.id}->${balance.moneyReceiver.id}`, balance);
    }

    for (const balance of balances) {
        const otherWayBalance = pairs.get(`${balance.moneyReceiver.id}->${balance.moneyHolder.id}`);

        if (balance.amount < 0) {
            console.warn("A balance is negative", balance);
        }

        const owsAmount = otherWayBalance ? balance.amount - otherWayBalance.amount : balance.amount;
        if (owsAmount < 0.01) {
            // Ows the other way around or doesn't owe anything, skip
            continue;
        }

        const paymentLink = await generatePaymentLink(balance.moneyHolder.id, balance.moneyReceiver.id, owsAmount);

        console.log(
            "Notify",
            balance.moneyHolder.email,
            "should send money to",
            balance.moneyReceiver.email,
            "=",
            owsAmount,
            process.env.NODE_ENV === "development" ? paymentLink : ""
        );

        try {
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
                        (otherWayBalance && otherWayBalance.lastRelatingPaymentRequest?.name !== balance.lastRelatingPaymentRequest?.name
                            ? ` and ${getUserDisplayName(balance.moneyReceiver)} still ows you for ${
                                  otherWayBalance.lastRelatingPaymentRequest?.name ?? "an unknown reason"
                              }`
                            : ""),
                })
            );
        } catch (ex) {
            console.error("Could not send mail to", balance.moneyHolder.email, ex);
        }
    }
}

async function sendMail(receiver: string, subject: string, body: string) {
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
        .promise();
}
