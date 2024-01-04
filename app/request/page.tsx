"use client";

import useSWR from "swr";
import {
    Button,
    Text,
    Center,
    Heading,
    Skeleton,
    Flex,
    Card,
    CardBody,
    CardFooter,
    CardHeader,
    Divider,
    Box,
    AvatarGroup,
    Avatar,
    Spacer,
    AvatarBadge,
    Modal,
    ModalBody,
    ModalCloseButton,
    ModalContent,
    ModalFooter,
    ModalHeader,
    ModalOverlay,
    FormControl,
    FormErrorMessage,
    FormHelperText,
    FormLabel,
    Input,
    useDisclosure,
} from "@chakra-ui/react";
import type { PaymentRequest, User } from "@prisma/client";
import { faArrowRight, faCheck, faPlus, faTimes, faUserCog } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { signIn, signOut, useSession } from "next-auth/react";
import { fetcher } from "@/util";
import { useRouter } from "next/navigation";
import { LogOutButton } from "@/components/LogOutButton";
import { AppHeader } from "@/components/AppHeader";
import { useEffect, useState } from "react";
import Link from "next/link";

function UserSettingsModal(props: { isOpen: boolean; onClose: () => void }) {
    const { data: user, isLoading: isLoadingUser } = useSWR<User>("/api/user", fetcher);
    const [iban, setIban] = useState("");
    const [mollieApiKey, setMollieApiKey] = useState("");
    const [saving, setSaving] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});

    useEffect(() => {
        if (typeof user?.iban === "string") {
            setIban(user.iban);
        }
    }, [user?.iban]);

    useEffect(() => {
        if (typeof user?.mollieApiKey === "string") {
            setMollieApiKey(user.mollieApiKey);
        }
    }, [user?.mollieApiKey]);

    async function saveChanges() {
        setSaving(true);
        setErrors({});
        try {
            const res = await fetch("/api/user", {
                method: "PATCH",
                body: JSON.stringify({
                    mollieApiKey,
                    iban,
                }),
            });
            if (res.ok) {
                props.onClose();
            } else {
                setErrors(await res.json());
            }
        } finally {
            setSaving(false);
        }
    }

    return (
        <Modal isOpen={props.isOpen} onClose={props.onClose}>
            <ModalOverlay />
            <ModalContent>
                <ModalHeader>Settings</ModalHeader>
                <ModalCloseButton />
                <form
                    onSubmit={(ev) => {
                        ev.preventDefault();
                        void saveChanges();
                    }}>
                    <ModalBody display="flex" flexDir="column" gap={4}>
                        <FormControl isInvalid={"iban" in errors} isDisabled={saving || isLoadingUser}>
                            <FormLabel>IBAN</FormLabel>
                            <Input type="text" value={iban} onChange={(ev) => setIban(ev.target.value)} />
                            {"iban" in errors ? (
                                <FormErrorMessage>{errors["iban"]}</FormErrorMessage>
                            ) : (
                                <FormHelperText>
                                    This is required if you want to accept payments via your banking number. People can only send money to this
                                    address.
                                </FormHelperText>
                            )}
                        </FormControl>

                        <FormControl isInvalid={"mollieApiKey" in errors} isDisabled={saving || isLoadingUser}>
                            <FormLabel>Mollie API key</FormLabel>
                            <Input placeholder="example: " type="text" value={mollieApiKey} onChange={(ev) => setMollieApiKey(ev.target.value)} />
                            {"mollieApiKey" in errors ? (
                                <FormErrorMessage>{errors["mollieApiKey"]}</FormErrorMessage>
                            ) : (
                                <FormHelperText>
                                    Optional. Visit the{" "}
                                    <Link target="_blank" href="https://mollie.com">
                                        mollie
                                    </Link>{" "}
                                    site to see what&apos;s up.
                                </FormHelperText>
                            )}
                        </FormControl>
                    </ModalBody>

                    <ModalFooter>
                        <Button type="button" variant="ghost" colorScheme="blue" mr={3} onClick={props.onClose}>
                            Cancel
                        </Button>
                        <Button isLoading={saving} colorScheme="green" isDisabled={saving} type="submit" variant="solid">
                            Save changes
                        </Button>
                    </ModalFooter>
                </form>
            </ModalContent>
        </Modal>
    );
}

export default function HomePage() {
    const router = useRouter();
    const { status: status } = useSession();
    const { data, isLoading } = useSWR<{
        requests: (PaymentRequest & { usersToPay: { user: User; payedAmount: number; partsOfAmount: number }[] })[];
    }>("/api/request", fetcher);
    const [loading, setLoading] = useState(false);
    const { isOpen: userSettingsIsOpen, onOpen: userSettingsOnOpen, onClose: userSettingsOnClose } = useDisclosure();

    async function createNew() {
        setLoading(true);
        try {
            const res = await fetch("/api/request", {
                method: "POST",
                body: JSON.stringify({ name: "New request", description: "" }),
            });
            if (res.ok) {
                const req: { request: PaymentRequest } = await res.json();
                router.push(`/request/${req.request.id}`);
            } else {
                console.error(await res.text());
            }
        } catch (ex) {
            setLoading(false);
            throw ex;
        }
    }

    useEffect(() => {
        if (status === "unauthenticated") {
            router.replace("/");
        }
    }, [status]);

    return (
        <Flex style={{ height: "100%", justifyContent: "center" }}>
            <Flex style={{ flexDirection: "column", gap: "1rem", padding: "1rem", width: "400px" }}>
                <AppHeader />

                <Divider />

                <Skeleton isLoaded={!isLoading} minHeight={"4rem"}>
                    <Flex flexDir="column" gap="1rem">
                        <Button
                            isLoading={loading}
                            isDisabled={loading}
                            onClick={createNew}
                            width="100%"
                            colorScheme="orange"
                            leftIcon={<FontAwesomeIcon icon={faPlus} />}>
                            Create new payment request
                        </Button>

                        {data?.requests?.map((e) => (
                            <Card
                                key={e.id}
                                // colorScheme="green"
                                background="#eee"
                                shadow="none"
                                border="1px solid transparent"
                                _hover={{ /*transform: "translate(0, -5px)",*/ background: "white", border: "1px solid #eee" }}
                                style={{ transition: "100ms" }}
                                cursor="pointer"
                                onClick={() => router.push(`/request/${e.id}`)}>
                                <CardHeader display="flex" alignItems="center">
                                    <Heading size="md">{e.name}</Heading>
                                    <Spacer />
                                    <Text fontSize="x-large">€{e.amount.toFixed(2)}</Text>
                                </CardHeader>
                                <CardBody pt={0}>
                                    <AvatarGroup size="md" max={8}>
                                        {e.usersToPay.map((u) => {
                                            return (
                                                <Avatar key={u.user.id} name={u.user.userName || u.user.email} src={u.user.avatarUrl || undefined}>
                                                    {/* <AvatarBadge boxSize="1.25em" bg={payed ? "green.500" : "red.500"}>
                                                        <FontAwesomeIcon color="white" size="2xs" icon={payed ? faCheck : faTimes} />
                                                    </AvatarBadge> */}
                                                </Avatar>
                                            );
                                        })}
                                    </AvatarGroup>
                                </CardBody>
                                {/* <CardFooter>
                                    <Button colorScheme="blue">Edit</Button>
                                </CardFooter> */}
                            </Card>
                        ))}

                        <Button leftIcon={<FontAwesomeIcon icon={faUserCog} />} variant="ghost" colorScheme="blue" onClick={userSettingsOnOpen}>
                            Settings
                        </Button>
                    </Flex>
                </Skeleton>

                {/* <Box mt={"auto"}></Box>
                <LogOutButton /> */}
            </Flex>

            <UserSettingsModal isOpen={userSettingsIsOpen} onClose={userSettingsOnClose} />
        </Flex>
    );
}
