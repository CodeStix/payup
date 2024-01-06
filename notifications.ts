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
const NOTIFY_NOT_UPDATE_BEFORE_MS = parseInt(process.env.NOTIFY_NOT_UPDATE_BEFORE_MS || String(1000 * 60 * 20));

export async function notifyPaymentReminders(all: boolean) {
    const emailTemplateString = await fs.readFile(REMINDER_EMAIL_TEMPLATE_PATH, { encoding: "utf-8" });

    const notifyBefore = new Date(new Date().getTime() - NOTIFY_PAYMENT_REMINDER_INTERVAL_MS);

    const reminders = await prisma.paymentCheckReminder.findMany({
        where: all
            ? { confirmed: null }
            : {
                  confirmed: null,
                  lastNotificationDate: {
                      lt: notifyBefore,
                  },
                  paidDate: {
                      lt: notifyBefore,
                  },
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

        console.log(
            "Remind",
            reminder.moneyReceiver.email,
            "about",
            reminder.moneyHolder.email,
            "=",
            reminder.paidAmount,
            process.env.NODE_ENV === "development" ? remindLink : ""
        );

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

    const now = new Date();
    const notifyBefore = new Date(now.getTime() - NOTIFY_INTERVAL_MS);
    const lastUpdatedBefore = new Date(now.getTime() - NOTIFY_NOT_UPDATE_BEFORE_MS);

    const balances = await prisma.relativeUserBalance.findMany({
        where: {
            amount: {
                not: 0,
            },
            lastUpdatedDate: all
                ? {}
                : {
                      lt: lastUpdatedBefore,
                  },
            lastNotificationDate: all
                ? {}
                : {
                      lt: notifyBefore,
                  },
        },
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
        where: {
            amount: {
                not: 0,
            },
            lastUpdatedDate: all
                ? {}
                : {
                      lt: lastUpdatedBefore,
                  },
            lastNotificationDate: all
                ? {}
                : {
                      lt: notifyBefore,
                  },
        },
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
