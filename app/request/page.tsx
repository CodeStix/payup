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
    Switch,
    Tooltip,
    Badge,
} from "@chakra-ui/react";
import type { PaymentRequest, User } from "@prisma/client";
import { faArrowRight, faCheck, faPlus, faTimes, faUserCog } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { signIn, signOut, useSession } from "next-auth/react";
import { fetcher, getUserDisplayName } from "@/util";
import { useRouter } from "next/navigation";
import { LogOutButton } from "@/components/LogOutButton";
import { AppHeader } from "@/components/AppHeader";
import { useEffect, useState } from "react";
import Link from "next/link";

function UserSettingsModal(props: { isOpen: boolean; onClose: () => void }) {
    const { data: user, isLoading: isLoadingUser } = useSWR<User>("/api/user", fetcher);
    const [iban, setIban] = useState("");
    const [mollieApiKey, setMollieApiKey] = useState("");
    const [allowOtherUserManualTranser, setAllowOtherUserManualTranser] = useState(false);
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

    useEffect(() => {
        if (typeof user?.allowOtherUserManualTranser === "boolean") {
            setAllowOtherUserManualTranser(user.allowOtherUserManualTranser);
        }
    }, [user?.allowOtherUserManualTranser]);

    async function saveChanges() {
        setSaving(true);
        setErrors({});
        try {
            const res = await fetch("/api/user", {
                method: "PATCH",
                body: JSON.stringify({
                    mollieApiKey,
                    iban,
                    allowOtherUserManualTranser,
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
                            <Input
                                placeholder="example: test_xxxxxxxxxx"
                                type="text"
                                value={mollieApiKey}
                                onChange={(ev) => setMollieApiKey(ev.target.value)}
                            />
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

                        <FormControl isInvalid={"allowOtherUserManualTranser" in errors} isDisabled={saving || isLoadingUser}>
                            <FormLabel>Allow others to manage payments for you</FormLabel>
                            <Switch isChecked={allowOtherUserManualTranser} onChange={(ev) => setAllowOtherUserManualTranser(ev.target.checked)} />
                            {"allowOtherUserManualTranser" in errors ? (
                                <FormErrorMessage>{errors["allowOtherUserManualTranser"]}</FormErrorMessage>
                            ) : (
                                <FormHelperText>
                                    If true, other people can let Pay Up know that you got paid (if you paid something). Disable it if you don't
                                    thrust your friends.
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
        requests: (PaymentRequest & { paidBy: User } & { usersToPay: { user: User; payedAmount: number; partsOfAmount: number }[] })[];
    }>("/api/request", fetcher);
    const { data: user, isLoading: isLoadingUser, mutate: mutateUser } = useSWR<User>("/api/user", fetcher);
    const [loading, setLoading] = useState(false);
    const { isOpen: userSettingsIsOpen, onOpen: userSettingsOnOpen, onClose: userSettingsOnClose } = useDisclosure();

    async function createNew() {
        setLoading(true);
        try {
            const res = await fetch("/api/request", {
                method: "POST",
                body: JSON.stringify({ name: "New request" }),
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

                <Skeleton isLoaded={!isLoading && !isLoadingUser} minHeight={"4rem"}>
                    {user?.iban || user?.mollieApiKey ? (
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
                                    <CardHeader>
                                        <Flex alignItems="center">
                                            <Box>
                                                <Heading size="md">{e.name}</Heading>
                                                <Text>{getUserDisplayName(e.paidBy)} paid</Text>
                                            </Box>
                                            <Spacer />
                                            <Text fontSize="x-large">€{e.amount.toFixed(2)}</Text>
                                        </Flex>
                                        {!e.published && (
                                            <Badge variant="solid" colorScheme="red">
                                                Not published yet
                                            </Badge>
                                        )}
                                    </CardHeader>
                                    <CardBody pt={0}>
                                        <Flex alignItems="center" gap={4}>
                                            <Tooltip openDelay={200} label={e.usersToPay.map((e) => getUserDisplayName(e.user)).join(", ")}>
                                                <AvatarGroup size="md" max={5}>
                                                    {e.usersToPay.map((u) => {
                                                        return (
                                                            <Avatar
                                                                key={u.user.id}
                                                                name={u.user.userName || u.user.email}
                                                                src={u.user.avatarUrl || undefined}>
                                                                {/* <AvatarBadge boxSize="1.25em" bg={payed ? "green.500" : "red.500"}>
                                                        <FontAwesomeIcon color="white" size="2xs" icon={payed ? faCheck : faTimes} />
                                                    </AvatarBadge> */}
                                                            </Avatar>
                                                        );
                                                    })}
                                                </AvatarGroup>
                                            </Tooltip>
                                            <Text>
                                                <FontAwesomeIcon size="xl" icon={faArrowRight} />
                                            </Text>
                                            <Tooltip openDelay={200} label={getUserDisplayName(e.paidBy)}>
                                                <Avatar name={e.paidBy.userName || e.paidBy.email} src={e.paidBy.avatarUrl || undefined}></Avatar>
                                            </Tooltip>
                                        </Flex>
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
                    ) : (
                        <AccountSetup onDone={() => mutateUser()} />
                    )}
                </Skeleton>
            </Flex>

            <UserSettingsModal isOpen={userSettingsIsOpen} onClose={userSettingsOnClose} />
        </Flex>
    );
}

function AccountSetup(props: { onDone: () => void }) {
    const [iban, setIban] = useState("");
    const [ibanError, setIbanError] = useState("");
    const [saving, setSaving] = useState(false);

    async function saveChanges() {
        setSaving(true);
        setIbanError("");
        try {
            const res = await fetch("/api/user", {
                method: "PATCH",
                body: JSON.stringify({
                    iban,
                }),
            });
            if (res.ok) {
                props.onDone();
            } else {
                const errors = await res.json();
                console.error("Could not setup account", errors);
                setIbanError(errors.iban);
            }
        } finally {
            setSaving(false);
        }
    }

    return (
        <form
            style={{ display: "flex", gap: "1rem", flexDirection: "column" }}
            onSubmit={(ev) => {
                ev.preventDefault();
                void saveChanges();
            }}>
            <Text opacity={0.5} textAlign="center">
                Welcome to Pay Up!
            </Text>
            <Text opacity={0.5} textAlign="center">
                Please enter your IBAN (banking number) where people will send you money.
            </Text>

            <FormControl isInvalid={!!ibanError} isDisabled={saving}>
                <FormLabel>IBAN</FormLabel>
                <Input type="text" value={iban} onChange={(ev) => setIban(ev.target.value)} />
                {ibanError ? (
                    <FormErrorMessage>{ibanError}. You can find this number in your banking app, example: NL62INGB6770096250</FormErrorMessage>
                ) : (
                    <FormHelperText>
                        This is required if you want to accept payments via your banking number. People can only send money to this address.
                    </FormHelperText>
                )}
            </FormControl>

            <Button type="submit" isLoading={saving} isDisabled={saving} rightIcon={<FontAwesomeIcon icon={faArrowRight} />} colorScheme="orange">
                Next: Create Payment Request
            </Button>
        </form>
    );
}
