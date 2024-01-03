import { createMollieClient } from "@mollie/api-client";
import { User } from "@prisma/client";

const clients = new Map<number, ReturnType<typeof createMollieClient>>();

export function getClientForUser(user: Partial<User>) {
    if (clients.has(user.id!)) {
        return clients.get(user.id!) || null;
    } else {
        if (!user.mollieApiKey) {
            return null;
        }
        const mollieClient = createMollieClient({ apiKey: user.mollieApiKey! });
        clients.set(user.id!, mollieClient);
        return mollieClient;
    }
}
