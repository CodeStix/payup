import type { RelativeUserBalance, User } from "@prisma/client";

export function moneyHolderReceiverToUsers(moneyHolder: number | Pick<User, "id">, moneyReceiver: number | Pick<User, "id">, amount: number = 0) {
    const moneyReceiverId = typeof moneyReceiver === "number" ? moneyReceiver : moneyReceiver.id;
    const moneyHolderId = typeof moneyHolder === "number" ? moneyHolder : moneyHolder.id;
    const flip = moneyHolderId > moneyReceiverId;
    return {
        firstUserId: flip ? moneyReceiverId : moneyHolderId,
        secondUserId: flip ? moneyHolderId : moneyReceiverId,
        amount: flip ? -amount : amount,
        moneyHolderKey: (flip ? "secondUser" : "firstUser") as "secondUser" | "firstUser",
        moneyReceiverKey: (!flip ? "secondUser" : "firstUser") as "secondUser" | "firstUser",
    };
}

export function balanceToMoneyHolderReceiver<
    B extends Partial<RelativeUserBalance> & {
        firstUser?: Partial<User>;
        secondUser?: Partial<User>;
    }
>(balance: B) {
    if (balance.amount === undefined) {
        throw new Error("balance.amount === undefined");
    }

    const flip = balance.amount >= 0;
    return {
        moneyReceiver: (flip ? balance.firstUser : balance.secondUser) as User,
        moneyHolder: (flip ? balance.secondUser : balance.firstUser) as User,
        moneyReceiverId: (flip ? balance.firstUserId : balance.secondUserId) as number,
        moneyHolderId: (flip ? balance.secondUserId : balance.firstUserId) as number,
        amount: Math.abs(balance.amount),
        lastPaymentDate: balance.lastPaymentDate,
        paymentPageOpenedDate: balance.paymentPageOpenedDate,
        lastNotificationDate: balance.lastNotificationDate,
    };
}
