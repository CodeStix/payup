import { PrismaClient, User } from "@prisma/client";
import AWS from "aws-sdk";
import jwt from "jsonwebtoken";
import fs from "fs/promises";
import { htmlToText } from "html-to-text";
import { getUserDisplayName } from "./util";
import { balanceToMoneyHolderReceiver } from "./balance";

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
    // Creation timestamp, used to invalidate this link if used again
    c?: number;
    // If is a reminder
    m?: true;
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

export async function generatePaymentReminderLink(holder: number, receiver: number, amount: number) {
    const jwtPayload: JwtPayload = {
        r: receiver,
        h: holder,
        o: amount,
        c: new Date().getTime(),
        m: true,
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

const NOTIFY_PAYMENT_REMINDER_INTERVAL_MS = parseInt(process.env.NOTIFY_PAYMENT_REMINDER_INTERVAL_MS || String(1000 * 60 * 60 * 24 * 5));
const NOTIFY_PAYMENT_TIMEOUT_MS = parseInt(process.env.NOTIFY_PAYMENT_TIMEOUT_MS || String(1000 * 60 * 60 * 24 * 3));

const NOTIFY_INTERVAL_MS = parseInt(process.env.NOTIFY_INTERVAL_MS || String(1000 * 60 * 60 * 24 * 3));
const NOTIFY_NOT_UPDATE_BEFORE_MS = parseInt(process.env.NOTIFY_NOT_UPDATE_BEFORE_MS || String(1000 * 60 * 15));

export async function notifyPaymentReminders(all: boolean) {
    const emailTemplateString = await fs.readFile(REMINDER_EMAIL_TEMPLATE_PATH, { encoding: "utf-8" });

    const now = new Date();
    const paidBefore = new Date(now.getTime() - NOTIFY_PAYMENT_TIMEOUT_MS);
    const notifyBefore = new Date(now.getTime() - NOTIFY_PAYMENT_REMINDER_INTERVAL_MS);

    const condition = all
        ? { amount: { not: 0 }, paymentPageOpenedDate: { not: null } }
        : {
              amount: {
                  not: 0,
              },
              paymentPageOpenedDate: {
                  lt: paidBefore,
              },
              lastReminderNotificationDate: {
                  lt: notifyBefore,
              },
          };
    const reminders = await prisma.relativeUserBalance.findMany({
        where: condition,
        select: {
            firstUser: {
                select: {
                    id: true,
                    userName: true,
                    iban: true,
                    avatarUrl: true,
                    email: true,
                },
            },
            secondUser: {
                select: {
                    id: true,
                    userName: true,
                    iban: true,
                    avatarUrl: true,
                    email: true,
                },
            },
            amount: true,
            paymentPageOpenedDate: true,
            lastRelatingPaymentRequest: {
                select: {
                    name: true,
                },
            },
        },
    });

    console.log("Sending", reminders.length, "payment reminders");

    for (const reminder of reminders) {
        const { moneyHolder, moneyReceiver, amount } = balanceToMoneyHolderReceiver(reminder);

        const remindLink = await generatePaymentReminderLink(moneyHolder.id, moneyReceiver.id, amount);

        console.log("Remind", moneyReceiver.email, "about", moneyHolder.email, "=", amount, process.env.NODE_ENV === "development" ? remindLink : "");

        try {
            await sendMail(
                moneyReceiver.email,
                `Did you receive ${amount.toFixed(2)} from ${getUserDisplayName(moneyHolder)}? Please confirm`,
                getEmailHtml(emailTemplateString, {
                    receiverUserName: getUserDisplayName(moneyReceiver),
                    holderUserName: getUserDisplayName(moneyHolder),
                    amount: amount.toFixed(2),
                    description: reminder.lastRelatingPaymentRequest?.name ?? "an unknown reason",
                    holderUserNameAndIban: moneyHolder.iban
                        ? `${getUserDisplayName(moneyHolder)} (${moneyHolder.iban})`
                        : getUserDisplayName(moneyHolder),
                    yesLink: remindLink + "?confirm=yes",
                    noLink: remindLink + "?confirm=no",
                    paidDate: reminder.paymentPageOpenedDate!.toLocaleString(),
                })
            );
        } catch (ex) {
            console.error("Could not send mail to", moneyReceiver.email, ex);
        }
    }

    await prisma.relativeUserBalance.updateMany({
        where: condition,
        data: {
            lastReminderNotificationDate: now,
        },
    });
}

export async function notifyUsers(all: boolean) {
    const emailTemplateString = await fs.readFile(EMAIL_TEMPLATE_PATH, { encoding: "utf-8" });

    const now = new Date();
    const notifyBefore = new Date(now.getTime() - NOTIFY_INTERVAL_MS);
    const lastUpdatedBefore = new Date(now.getTime() - NOTIFY_NOT_UPDATE_BEFORE_MS);

    const condition = all
        ? { amount: { not: 0 } }
        : {
              amount: {
                  not: 0,
              },
              paymentPageOpenedDate: null,
              lastUpdatedDate: {
                  lt: lastUpdatedBefore,
              },
              OR: [
                  {
                      lastNotificationDate: {
                          lt: notifyBefore,
                      },
                  },
                  {
                      lastNotificationDate: null,
                  },
              ],
          };
    const balances = await prisma.relativeUserBalance.findMany({
        where: condition,
        select: {
            lastUpdatedDate: true,
            lastNotificationDate: true,
            amount: true,
            firstUser: {
                select: {
                    id: true,
                    email: true,
                    userName: true,
                },
            },
            secondUser: {
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

    for (const balance of balances) {
        const { moneyHolder, moneyReceiver, amount } = balanceToMoneyHolderReceiver(balance);
        if (moneyHolder.id === moneyReceiver.id) {
            console.warn("Row with self reference found", moneyHolder.id);
            continue;
        }

        if (amount < 0.01) {
            console.warn("Skipping", moneyHolder.id, "to", moneyReceiver.id, "because amount", amount);
            continue;
        }

        const paymentLink = await generatePaymentLink(moneyHolder.id, moneyReceiver.id, amount);

        console.log(
            "Notify",
            moneyHolder.email,
            "should send money to",
            moneyReceiver.email,
            "=",
            amount,
            process.env.NODE_ENV === "development" ? paymentLink : ""
        );

        try {
            await sendMail(
                moneyHolder.email,
                `You still owe ${getUserDisplayName(moneyReceiver)} money, pay up!`,
                getEmailHtml(emailTemplateString, {
                    paymentLink,
                    userName: getUserDisplayName(moneyHolder),
                    paidByUserName: getUserDisplayName(moneyReceiver),
                    paidByEmail: moneyReceiver.email,
                    description: balance.lastRelatingPaymentRequest?.name ?? "an unknown reason",
                })
            );
        } catch (ex) {
            console.error("Could not send mail to", moneyHolder.email, ex);
        }
    }

    await prisma.relativeUserBalance.updateMany({
        where: condition,
        data: {
            lastNotificationDate: now,
        },
    });
}

async function sendMail(receiver: string, subject: string, body: string) {
    if (process.env.NODE_ENV === "development") {
        if (!["reddusted@gmail.com", "stijn.rogiest@gmail.com", "stijnvantvijfde@gmail.com"].includes(receiver.toLowerCase())) {
            console.log("Skipped sending dev mail to", receiver, "about", subject);
            return;
        }
    }

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
