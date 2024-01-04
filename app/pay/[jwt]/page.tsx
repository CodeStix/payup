"use client";

import type { PayResponse } from "@/app/api/pay/[jwt]/route";
import { fetcher, getUserDisplayName, removeEmailDomain } from "@/util";
import { Button, Text, Center, Heading, Skeleton, AlertTitle, Alert, AlertIcon, Flex, Link } from "@chakra-ui/react";
import { faArrowRight, faCheckCircle, faClipboard, faClipboardCheck } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { RelativeUserBalance, User } from "@prisma/client";
import { signIn, signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";

export default function Home({ params }: { params: { jwt: string } }) {
    const router = useRouter();

    const {
        data: link,
        isLoading: isLoadingLink,
        mutate: mutateLink,
    } = useSWR<{
        balance: RelativeUserBalance & { lastRelatingPaymentRequest?: { name: string }; moneyHolder: User; moneyReceiver: User };
        otherWayBalance?: RelativeUserBalance & { lastRelatingPaymentRequest?: { name: string } };
        paymentMethod: "mollie" | "iban";
    }>(`/api/pay/${params.jwt}`, fetcher);

    const [loading, setLoading] = useState(false);
    const [copied, setCopied] = useState(false);
    const paidRef = useRef(false);

    const lastPaymentDate = link?.balance.lastPaymentDate;
    const amount = !link ? null : link.otherWayBalance ? link.balance.amount - link.otherWayBalance.amount : link.balance.amount;
    const paid = amount ? amount < 0.01 : false;

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
                        await mutateLink();
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
        if (link) {
            if (link.paymentMethod === "iban") {
                // Pay automatically
                if (!paidRef.current) {
                    paidRef.current = true;
                    // void fetchPay(params.jwt);
                }
            }
        }
    }, [link]);

    return (
        <Center style={{ height: "100%", flexDirection: "column", gap: "1em" }}>
            <Heading as="h1">Pay Up!</Heading>

            <Skeleton isLoaded={!!link} minW="400px">
                {link?.paymentMethod === "mollie" ? (
                    <>
                        {paid ? (
                            <Heading color="green.500" textAlign="center">
                                You already paid {link.balance.moneyReceiver && getUserDisplayName(link.balance.moneyReceiver)}!
                            </Heading>
                        ) : (
                            <Heading as="h2" textAlign="center">
                                You still owe {link.balance.moneyReceiver && getUserDisplayName(link.balance.moneyReceiver)} €{amount}!
                            </Heading>
                        )}
                    </>
                ) : (
                    <>
                        {paid ? (
                            <Heading color="yellow.500" textAlign="center">
                                You could still be owing €{amount} to {link?.balance.moneyReceiver && getUserDisplayName(link.balance.moneyReceiver)}!
                            </Heading>
                        ) : (
                            <Heading as="h2" textAlign="center">
                                You still owe {link?.balance.moneyReceiver && getUserDisplayName(link.balance.moneyReceiver)} €{amount}!
                            </Heading>
                        )}
                    </>
                )}
            </Skeleton>

            <Skeleton isLoaded={!!link} minW="300px" textAlign="center">
                {link?.balance.lastRelatingPaymentRequest && <>For {link.balance.lastRelatingPaymentRequest.name}.</>}

                {link?.otherWayBalance?.lastRelatingPaymentRequest && (
                    <>
                        (This includes the money that {getUserDisplayName(link.balance.moneyReceiver)} stills ows you for{" "}
                        {link.otherWayBalance.lastRelatingPaymentRequest.name})
                    </>
                )}
            </Skeleton>

            {/* && (!lastPaymentDate || new Date().getTime() - new Date(lastPaymentDate).getTime() > 60 * 1000) */}
            {link?.paymentMethod === "iban" && paid && (
                <Alert status="warning" rounded="lg" maxW="lg" flexDir="column" textAlign="center">
                    <Flex>
                        <AlertIcon />
                        <AlertTitle>You already paid?</AlertTitle>
                    </Flex>
                    You already opened this link {lastPaymentDate && <>at {new Date(lastPaymentDate).toLocaleString()}</>}.
                </Alert>
            )}

            <Skeleton isLoaded={!!link}>
                {link?.paymentMethod === "mollie" ? (
                    <Button
                        isDisabled={loading || isLoadingLink || paid}
                        isLoading={loading || isLoadingLink}
                        size="lg"
                        minW="sm"
                        colorScheme="green"
                        rightIcon={<FontAwesomeIcon icon={paid ? faCheckCircle : faArrowRight} />}
                        onClick={() => {
                            setLoading(true);
                            // void fetchPay(link.id);
                        }}>
                        {paid ? <>You already paid!</> : <>Select your bank</>}
                    </Button>
                ) : (
                    <Button
                        isDisabled={loading || isLoadingLink}
                        isLoading={loading || isLoadingLink}
                        size="lg"
                        minW="sm"
                        colorScheme="green"
                        leftIcon={<FontAwesomeIcon icon={copied ? faClipboardCheck : faClipboard} />}
                        // rightIcon={<FontAwesomeIcon icon={faArrowRight} />}
                        onClick={() => {
                            if (link && link.paymentMethod === "iban") {
                                void navigator.clipboard.writeText(link.balance.moneyReceiver.iban!);
                                setCopied(true);
                            }
                        }}>
                        {!copied ? <>Copy IBAN to clipboard</> : <>Copied!</>}
                    </Button>
                )}
            </Skeleton>

            <Skeleton isLoaded={!!link}>
                <Text style={{ opacity: "0.5", maxWidth: "500px", textAlign: "center", minHeight: "2rem" }} textAlign="center">
                    {link?.paymentMethod === "mollie" ? (
                        <>
                            {getUserDisplayName(link.balance.moneyReceiver)} selected{" "}
                            <Link target="_blank" href="https://mollie.com">
                                mollie
                            </Link>{" "}
                            as their preferred payment method.
                        </>
                    ) : (
                        <>
                            Open your banking app and send €{amount?.toFixed(2) ?? 0} to {link && getUserDisplayName(link.balance.moneyReceiver)} (
                            {link?.balance.moneyReceiver.iban}). You can close this page if you already paid it, you won&apos;t be notified again.
                        </>
                    )}
                </Text>
            </Skeleton>
        </Center>
    );
}
