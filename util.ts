export const fetcher = (...args: any) => (fetch as any)(...args).then((res: any) => res.json());
