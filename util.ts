export const fetcher = (...args: any) => (fetch as any)(...args).then((res: any) => res.json());

export function removeEmailDomain(email: string) {
    return email.split("@")[0];
}

export function getUserDisplayName(u: { userName?: string | null; email: string; id?: number }, me?: { id?: number | null; email?: string | null }) {
    if (me) {
        if ((me.email && u.email === me.email) || (me.id && u.id && me.id === u.id)) {
            return "You";
        }
    }
    return u.userName || removeEmailDomain(u.email);
}

export function getTotalParts(usersToPay: { partsOfAmount: number }[]) {
    let parts = 0;
    usersToPay.forEach((u) => (parts += u.partsOfAmount));
    return parts;
}

export function calculateUserAmount(totalPaymentRequestParts: number, totalAmount: number, userParts: number) {
    return (userParts / totalPaymentRequestParts) * totalAmount;
}
