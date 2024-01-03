"use client";

import type { PayResponse } from "@/app/api/pay/[jwt]/route";
import { fetcher, removeEmailDomain } from "@/util";
import { Button, Text, Center, Heading, Skeleton, AlertTitle, Alert, AlertIcon, Flex, Link } from "@chakra-ui/react";
import { faArrowRight, faCheckCircle, faClipboard, faClipboardCheck } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { PaymentLink, User } from "@prisma/client";
import { signIn, signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";

export default function Home({ params }: { params: { jwt: string } }) {
    const router = useRouter();

    const {
        data: paymentLink,
        isLoading: isLoadingPaymentLink,
        mutate: mutatePaymentLink,
    } = useSWR<PaymentLink & { sendingUser: User; receivingUser: User; checkoutUrl?: string; status?: string }>(`/api/pay/${params.jwt}`, fetcher);

    const [loading, setLoading] = useState(false);
    const [copied, setCopied] = useState(false);
    const paidRef = useRef(false);
    const senderDisplayName = paymentLink?.sendingUser.userName || removeEmailDomain(paymentLink?.sendingUser.email ?? "");

    async function fetchPay(linkId: string) {
        const prevLoading = loading;
        setLoading(true);
        try {
            const res = await fetch("/api/pay/" + encodeURIComponent(linkId), {
                method: "POST",
            });

            if (res.ok) {
                const payRes: PayResponse = await res.json();
                if (payRes.paymentMethod === "mollie") {
                    if (!payRes.paid && payRes.status !== "paid") {
                        location.href = payRes.checkoutUrl!;
                    } else {
                        await mutatePaymentLink();
                    }
                }
            } else {
                console.error("Could not pay", await res.text());
            }
        } finally {
            setLoading(prevLoading);
        }
    }

    useEffect(() => {
        if (paymentLink) {
            if (
                paymentLink.paymentMethod === "iban" ||
                (paymentLink.paymentMethod === "mollie" && !paymentLink.paid && paymentLink.status === "paid")
            ) {
                // Pay automatically
                if (!paidRef.current) {
                    paidRef.current = true;
                    void fetchPay(params.jwt);
                }
            }
        }
    }, [paymentLink]);

    return (
        <Center style={{ height: "100%", flexDirection: "column", gap: "1em" }}>
            <Heading as="h1">Pay Up!</Heading>

            <Skeleton isLoaded={!!paymentLink} minW="400px">
                {paymentLink?.paymentMethod === "mollie" && paymentLink.paid ? (
                    <Heading color="green.500" textAlign="center">
                        You paid €{paymentLink?.amount.toFixed(2)} to {senderDisplayName}.
                    </Heading>
                ) : (
                    <Heading as="h2" textAlign="center">
                        You still owe {senderDisplayName} €{paymentLink?.amount.toFixed(2)}!
                    </Heading>
                )}
            </Skeleton>

            <Skeleton isLoaded={!!paymentLink} minW="300px" textAlign="center">
                For {(paymentLink?.amountPerPaymentRequest as { name: string }[])?.map((e) => e.name).join(", ")}.
            </Skeleton>

            {paymentLink?.paymentMethod === "iban" &&
                paymentLink?.paid &&
                paymentLink.paidDate &&
                new Date().getTime() - new Date(paymentLink.paidDate).getTime() > 60 * 1000 && (
                    <Alert status="warning" rounded="lg" maxW="lg" flexDir="column" textAlign="center">
                        <Flex>
                            <AlertIcon />
                            <AlertTitle>You already paid?</AlertTitle>
                        </Flex>
                        You already opened this link at {new Date(paymentLink.paidDate).toLocaleString()}.
                    </Alert>
                )}

            <Skeleton isLoaded={!!paymentLink}>
                {paymentLink?.paymentMethod === "mollie" ? (
                    <Button
                        isDisabled={loading || isLoadingPaymentLink || paymentLink.paid}
                        isLoading={loading || isLoadingPaymentLink}
                        size="lg"
                        minW="sm"
                        colorScheme="green"
                        rightIcon={<FontAwesomeIcon icon={paymentLink.paid ? faCheckCircle : faArrowRight} />}
                        onClick={() => {
                            setLoading(true);
                            void fetchPay(paymentLink.id);
                        }}>
                        {paymentLink.paid ? <>You already paid!</> : <>Select your bank</>}
                    </Button>
                ) : (
                    <Button
                        isDisabled={loading || isLoadingPaymentLink}
                        isLoading={loading || isLoadingPaymentLink}
                        size="lg"
                        minW="sm"
                        colorScheme="green"
                        leftIcon={<FontAwesomeIcon icon={copied ? faClipboardCheck : faClipboard} />}
                        // rightIcon={<FontAwesomeIcon icon={faArrowRight} />}
                        onClick={() => {
                            if (paymentLink && paymentLink.paymentMethod === "iban") {
                                void navigator.clipboard.writeText(paymentLink.sendingUser.iban!);
                                setCopied(true);
                            }
                        }}>
                        {!copied ? <>Copy IBAN to clipboard</> : <>Copied!</>}
                    </Button>
                )}
            </Skeleton>

            <Skeleton isLoaded={!!paymentLink}>
                <Text style={{ opacity: "0.5", maxWidth: "500px", textAlign: "center", minHeight: "2rem" }} textAlign="center">
                    {paymentLink?.paymentMethod === "mollie" ? (
                        <>
                            {senderDisplayName} selected{" "}
                            <Link target="_blank" href="https://mollie.com">
                                mollie
                            </Link>{" "}
                            as their preferred payment method.
                        </>
                    ) : (
                        <>
                            Open your banking app and send €{paymentLink?.amount.toFixed(2) ?? 0} to {senderDisplayName} (
                            {paymentLink?.sendingUser.iban}). You can close this page if you already paid it, you won't be notified again.
                        </>
                    )}
                </Text>
            </Skeleton>
        </Center>
    );
}
