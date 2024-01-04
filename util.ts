export const fetcher = (...args: any) => (fetch as any)(...args).then((res: any) => res.json());

export function removeEmailDomain(email: string) {
    return email.split("@")[0];
}

export function getUserDisplayName(u: { userName?: string | null; email: string }) {
    return u.userName || removeEmailDomain(u.email);
}
