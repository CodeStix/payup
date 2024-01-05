"use client";

import { AppHeader } from "@/components/AppHeader";
import { EditableControls } from "@/components/EditableControls";
import { LogOutButton } from "@/components/LogOutButton";
import Mexp from "math-expression-evaluator";
import { fetcher, getUserDisplayName, removeEmailDomain } from "@/util";
import {
    Flex,
    Heading,
    Skeleton,
    Button,
    Editable,
    EditableInput,
    EditablePreview,
    Divider,
    Grid,
    Box,
    Text,
    FormControl,
    FormHelperText,
    FormLabel,
    Input,
    NumberDecrementStepper,
    NumberIncrementStepper,
    NumberInput,
    NumberInputField,
    NumberInputStepper,
    InputGroup,
    InputLeftElement,
    InputLeftAddon,
    List,
    UnorderedList,
    ListItem,
    IconButton,
    Avatar,
    Spacer,
    InputRightElement,
    Popover,
    PopoverArrow,
    PopoverBody,
    PopoverCloseButton,
    PopoverContent,
    PopoverHeader,
    PopoverTrigger,
    PopoverFooter,
    AlertDialog,
    AlertDialogBody,
    AlertDialogContent,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogOverlay,
    useDisclosure,
    Modal,
    ModalBody,
    ModalCloseButton,
    ModalContent,
    ModalFooter,
    ModalHeader,
    ModalOverlay,
    ButtonGroup,
    Tooltip,
    Alert,
    AlertDescription,
    AlertIcon,
    AlertTitle,
} from "@chakra-ui/react";
import {
    faArrowDown,
    faArrowRight,
    faArrowUp,
    faCheck,
    faCheckCircle,
    faCheckDouble,
    faChevronLeft,
    faClipboard,
    faClipboardCheck,
    faCoins,
    faCopy,
    faExclamationTriangle,
    faHandHoldingDollar,
    faHandshake,
    faHourglass,
    faLink,
    faMoneyBill,
    faMoneyBill1Wave,
    faPlus,
    faSave,
    faSearch,
    faSubtract,
    faTimes,
    faTrash,
    faUserCheck,
    faWarning,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { PaymentRequest, PaymentRequestToUser, RelativeUserBalance, User } from "@prisma/client";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import QRCode from "react-qr-code";

export default function PaymentRequestDetailPage({ params }: { params: { id: string } }) {
    const router = useRouter();
    const { status, data: sessionData } = useSession();
    const [userQuery, setUserQuery] = useState("");
    const [activeUserQuery, setActiveUserQuery] = useState("");
    const [amount, setAmount] = useState<string>("");
    const [isUpdating, setUpdating] = useState(false);
    const { isOpen: isOpenDelete, onOpen: onOpenDelete, onClose: onCloseDelete } = useDisclosure();
    const cancelRef = useRef<HTMLButtonElement>(null);
    const {
        data: request,
        isLoading: requestIsLoading,
        mutate: mutateRequest,
    } = useSWR<PaymentRequest & { usersToPay: { user: User; partsOfAmount: number }[]; paidBy: User }>("/api/request/" + params.id, fetcher);
    const { data: searchResults, isLoading: searchResultsAreLoading } = useSWR<User[]>(
        "/api/user/search?query=" + encodeURIComponent(activeUserQuery),
        fetcher
    );
    const filteredSearchResults = useMemo(
        () => (searchResults && request ? searchResults.filter((e) => !request.usersToPay.some((f) => f.user.id === e.id)) : []),
        [searchResults, request]
    );
    const { isOpen: paymentLinkIsOpen, onOpen: paymentLinkOnOpen, onClose: paymentLinkOnClose } = useDisclosure();
    const { isOpen: manualPaymentIsOpen, onOpen: manualPaymentOnOpen, onClose: manualPaymentOnClose } = useDisclosure();
    const [generatedPaymentLink, setGeneratedPaymentLink] = useState("");
    const [manualPaymentMoneyHolder, setManualPaymentMoneyHolder] = useState<User>();
    // const [showOpenPaymentLinkButton, setShowOpenPaymentLinkButton] = useState(false);

    const totalParts = useMemo(() => {
        let parts = 0;
        for (let u of request?.usersToPay ?? []) {
            parts += u.partsOfAmount;
        }
        if (parts <= 0) {
            parts = 1;
        }
        return parts;
    }, [request?.usersToPay]);

    useEffect(() => {
        if (request) {
            setAmount(String(request.amount));
        }
    }, [request?.amount]);

    useEffect(() => {
        function updateActiveQuery() {
            setActiveUserQuery(userQuery);
        }

        const i = setTimeout(updateActiveQuery, 500);
        return () => {
            clearTimeout(i);
        };
    }, [userQuery]);

    async function generatePaymentLink(moneyHolderId: number, moneyReceiverId: number) {
        setUpdating(true);
        try {
            const res = await fetch(`/api/pay`, {
                method: "POST",
                body: JSON.stringify({ moneyHolderId, moneyReceiverId }),
            });
            if (!res.ok) {
                console.error(res.status, await res.text());
                throw new Error("Could not generate payment link");
            } else {
                const data = await res.json();
                setGeneratedPaymentLink(data.paymentLink);
                return data.paymentLink;
            }
        } finally {
            setUpdating(false);
        }
    }

    async function patch(n: Partial<PaymentRequest & { usersToPay: { user: { id: number }; userId?: number; partsOfAmount: number }[] }>) {
        setUpdating(true);
        try {
            const res = await fetch(`/api/request/${params.id}`, {
                method: "PATCH",
                body: JSON.stringify(n),
            });
            if (!res.ok) {
                console.error(res.status, await res.text());
                throw new Error("Could not patch");
            }

            console.log("set", { ...request, ...n });
            await mutateRequest();
        } finally {
            setUpdating(false);
        }
    }

    async function createNewUser(email: string) {
        const res = await fetch(`/api/user`, {
            method: "POST",
            body: JSON.stringify({
                email: email,
            }),
        });
        if (!res.ok) {
            console.error(res.status, await res.text());
            throw new Error("Could not patch");
        }

        return (await res.json()).user as User;
    }

    async function createNewUserAndBind(email: string) {
        if (!searchResults) {
            console.error("Cannot createNewUserAndBind, not loaded");
            return;
        }

        setUpdating(true);
        try {
            let user = searchResults.find((e) => e.email === email);
            if (!user) {
                user = await createNewUser(email);
            }
            await bindUser(user);
            setUserQuery("");
        } finally {
            setUpdating(false);
        }
    }

    async function bindUser(user: User, partsOfAmount: number = 1) {
        if (!request) {
            console.error("Cannot bindUser, not loaded");
            return;
        }
        setUpdating(true);
        try {
            await patch({
                usersToPay: [
                    ...request.usersToPay.filter((e) => e.user.id !== user.id),
                    { user: user, userId: user.id, partsOfAmount: partsOfAmount },
                ],
            });
        } finally {
            setUpdating(false);
        }
    }

    async function updatePayingUser(userId: number) {
        if (!request) {
            console.error("Cannot updatePayingUser, not loaded");
            return;
        }
        setUpdating(true);
        try {
            await patch({
                paidById: userId,
            });
        } finally {
            setUpdating(false);
        }
    }

    async function unbindUser(user: User) {
        if (!request) {
            console.error("Cannot unbindUser, not loaded");
            return;
        }
        setUpdating(true);
        try {
            await patch({
                usersToPay: request.usersToPay.filter((e) => e.user.id !== user.id),
            });
        } finally {
            setUpdating(false);
        }
    }

    async function updateAmount(amountStr: string) {
        let amount;
        try {
            const mexp = new Mexp();
            amount = mexp.eval(amountStr, [], {});
            if (isNaN(amount)) {
                throw true;
            }
        } catch {
            amount = parseFloat(amountStr);
        }

        if (isNaN(amount)) {
            console.error("Invalid amount");
        } else if (amount !== request?.amount) {
            console.log(amount, request?.amount);
            await patch({
                amount: amount,
            });
        }
    }

    async function deletePaymentRequest() {
        if (!request) return;
        setUpdating(true);
        try {
            const res = await fetch(`/api/request/${request.id}`, {
                method: "DELETE",
            });
            if (res.ok) {
                router.back();
            } else {
                throw new Error("Could not delete");
            }
        } finally {
            setUpdating(false);
        }
    }

    useEffect(() => {
        if (status === "unauthenticated") {
            router.replace("/");
        }
    }, [status]);

    return (
        <Flex style={{ height: "100%", justifyContent: "center" }}>
            <Flex flexDir="column">
                <Flex style={{ flexDirection: "column", gap: "1rem", padding: "1rem", width: "400px", overflow: "auto" }}>
                    <AppHeader backButton />

                    <Divider />

                    <Skeleton isLoaded={!!request}>
                        <Heading as="h2" fontSize="x-large">
                            <Editable
                                display="flex"
                                alignItems="center"
                                gap={2}
                                flexWrap="nowrap"
                                isDisabled={isUpdating}
                                defaultValue={request?.name}
                                onSubmit={(ev) => {
                                    if (ev !== request?.name) {
                                        void patch({
                                            name: ev,
                                        });
                                    }
                                }}>
                                <EditablePreview />
                                <EditableInput style={{}} />
                                <EditableControls />
                            </Editable>
                        </Heading>
                    </Skeleton>

                    <Skeleton isLoaded={!!request}>
                        <form
                            onSubmit={(ev) => {
                                ev.preventDefault();
                                void updateAmount(amount);
                            }}>
                            <FormControl isDisabled={isUpdating}>
                                <FormLabel>Total amount</FormLabel>
                                <InputGroup>
                                    {/* <InputLeftAddon>€</InputLeftAddon> */}
                                    <InputLeftElement pointerEvents="none" color="gray.300" fontSize="1.2em">
                                        €
                                    </InputLeftElement>

                                    <Input
                                        onBlur={(ev) => {
                                            setAmount(ev.target.value);
                                            void updateAmount(ev.target.value);
                                        }}
                                        autoFocus
                                        value={amount}
                                        onChange={(ev) => setAmount(ev.target.value)}
                                        max={100000}
                                        min={1}
                                        type="text"></Input>
                                </InputGroup>
                                {request?.paidBy && (
                                    <FormHelperText>
                                        Paid by{" "}
                                        <Tooltip closeOnClick={false} openDelay={200} label="You can change the payer using the list below.">
                                            {getUserDisplayName(request.paidBy, sessionData?.user)}
                                        </Tooltip>
                                        . This amount will be divided over your friends.
                                    </FormHelperText>
                                )}
                            </FormControl>
                        </form>
                    </Skeleton>

                    <form
                        style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
                        onSubmit={(ev) => {
                            // void createNewUserAndBind(userQuery);
                            ev.preventDefault();
                        }}>
                        <Skeleton isLoaded={!!request}>
                            <FormControl isDisabled={isUpdating}>
                                <FormLabel>Who has to Pay Up?</FormLabel>
                                <InputGroup>
                                    <InputLeftElement pointerEvents="none" color="gray.300">
                                        <FontAwesomeIcon icon={faSearch} />
                                    </InputLeftElement>
                                    <Input
                                        onChange={(ev) => setUserQuery(ev.target.value)}
                                        value={userQuery}
                                        placeholder="search or enter email..."></Input>
                                    {userQuery.length > 0 && (
                                        <InputRightElement width="3rem">
                                            <IconButton
                                                icon={<FontAwesomeIcon icon={faTimes} />}
                                                h="1.75rem"
                                                size="sm"
                                                onClick={() => setUserQuery("")}
                                                aria-label={"Clear search query"}></IconButton>
                                        </InputRightElement>
                                    )}
                                </InputGroup>

                                {/* <FormHelperText>
                                You can also enter an email address.
                            </FormHelperText> */}
                            </FormControl>
                        </Skeleton>
                    </form>

                    {userQuery.includes("@") &&
                        !searchResultsAreLoading &&
                        !isUpdating &&
                        (searchResults?.length ?? 0) === 0 &&
                        userQuery === activeUserQuery && (
                            <Button
                                // isDisabled={isUpdating || usersIsLoading || userQuery !== activeUserQuery}
                                onClick={() => void createNewUserAndBind(userQuery)}
                                w="full"
                                size="md"
                                variant={"solid"}
                                colorScheme="green">
                                Add&nbsp;<Box>{userQuery}</Box>
                            </Button>
                        )}
                    <Skeleton isLoaded={request && searchResults && userQuery === activeUserQuery}>
                        <Text as="p" opacity={0.5}>
                            {filteredSearchResults.length === 0
                                ? userQuery
                                    ? "No results"
                                    : ""
                                : userQuery
                                ? "Search results"
                                : "Recommended users"}
                        </Text>

                        <UnorderedList ml={0}>
                            {filteredSearchResults.map((u) => (
                                <ListItem my={1} display="flex" key={u.id} alignItems="center" gap={2}>
                                    <Tooltip label={u.email} openDelay={200}>
                                        <Avatar size="sm" name={getUserDisplayName(u)} src={u.avatarUrl || undefined} />
                                    </Tooltip>

                                    <Tooltip label={u.email} openDelay={200}>
                                        <Text wordBreak="break-word" fontWeight="normal">
                                            {getUserDisplayName(u, sessionData?.user)}{" "}
                                            {/* {u.email === sessionData?.user?.email && (
                                                <Text as="span" opacity={0.5}>
                                                    (you)
                                                </Text>
                                            )} */}
                                        </Text>
                                    </Tooltip>
                                    <Spacer />
                                    {/* <IconButton
                                        isDisabled={isUpdating}
                                        onClick={() => void updatePayingUser(u.id)}
                                        size="sm"
                                        colorScheme="blue"
                                        aria-label="Set as paying user"
                                        icon={<FontAwesomeIcon icon={faCoins} />}></IconButton> */}
                                    <IconButton
                                        isDisabled={isUpdating}
                                        onClick={() => void bindUser(u)}
                                        size="sm"
                                        colorScheme="green"
                                        aria-label="Add user"
                                        icon={<FontAwesomeIcon icon={faPlus} />}></IconButton>
                                </ListItem>
                            ))}
                        </UnorderedList>
                    </Skeleton>

                    {(request?.usersToPay.length ?? 0) > 0 && <Divider />}

                    <Skeleton isLoaded={!!request}>
                        <Text as="p" fontWeight="bold" color="blue.500">
                            <FontAwesomeIcon icon={faCoins} /> User that paid
                        </Text>

                        <Flex alignItems="center" gap={2} my={1}>
                            {request?.paidBy && (
                                <Tooltip label={request?.paidBy.email ?? ""} openDelay={200}>
                                    <Avatar
                                        size="sm"
                                        name={getUserDisplayName(request?.paidBy, sessionData?.user)}
                                        src={request?.paidBy.avatarUrl ?? undefined}
                                    />
                                </Tooltip>
                            )}

                            {request?.paidBy && (
                                <Tooltip label={request?.paidBy.email} openDelay={200}>
                                    <Text wordBreak="break-word" fontWeight="normal">
                                        {getUserDisplayName(request.paidBy, sessionData?.user)}
                                    </Text>
                                </Tooltip>
                            )}
                        </Flex>
                    </Skeleton>

                    <Skeleton isLoaded={!!request}>
                        {(request?.usersToPay.length ?? 0) > 0 && (
                            <Text as="p" fontWeight="bold" color="green.500">
                                <FontAwesomeIcon icon={faCoins} /> Paying users
                            </Text>
                        )}
                        <UnorderedList ml={0}>
                            {request?.usersToPay.map((e) => (
                                <PayingUserListItem
                                    request={request}
                                    totalParts={totalParts}
                                    key={e.user.id}
                                    payingUser={e}
                                    isDisabled={isUpdating}
                                    onManualPayment={() => {
                                        setManualPaymentMoneyHolder(e.user);
                                        manualPaymentOnOpen();
                                    }}
                                    onPaymentLink={async (otherWay, instant) => {
                                        let link;
                                        if (otherWay) {
                                            link = await generatePaymentLink(request.paidBy.id, e.user.id);
                                        } else {
                                            link = await generatePaymentLink(e.user.id, request.paidBy.id);
                                        }

                                        if (instant) {
                                            window.open(link, "_blank");
                                        } else {
                                            paymentLinkOnOpen();
                                        }
                                    }}
                                    onChangeFraction={(newFraction) => {
                                        void bindUser(e.user, newFraction);
                                    }}
                                    onRemove={() => {
                                        void unbindUser(e.user);
                                    }}
                                    onSetPayingUser={() => {
                                        void updatePayingUser(e.user.id);
                                    }}
                                />
                            ))}
                        </UnorderedList>
                    </Skeleton>

                    <Divider />

                    <Skeleton isLoaded={!!request}>
                        <Button w="full" colorScheme="red" leftIcon={<FontAwesomeIcon icon={faTrash} />} onClick={() => onOpenDelete()}>
                            Delete payment request
                        </Button>
                        {request?.createdDate && (
                            <Text opacity={0.5} fontSize="xs" as="p" mt={1}>
                                Created at {new Date(request.createdDate).toLocaleString()}
                            </Text>
                        )}
                    </Skeleton>

                    <AlertDialog isOpen={isOpenDelete} leastDestructiveRef={cancelRef} onClose={onCloseDelete}>
                        <AlertDialogOverlay>
                            <AlertDialogContent>
                                <AlertDialogHeader fontSize="lg" fontWeight="bold">
                                    Delete payment request
                                </AlertDialogHeader>

                                <AlertDialogBody>Are you sure? You can&apos;t undo this action afterwards.</AlertDialogBody>

                                <AlertDialogFooter>
                                    <Button ref={cancelRef} onClick={onCloseDelete}>
                                        Cancel
                                    </Button>
                                    <Button
                                        isDisabled={isUpdating}
                                        colorScheme="red"
                                        onClick={async () => {
                                            await deletePaymentRequest();
                                            onCloseDelete();
                                        }}
                                        ml={3}>
                                        Delete
                                    </Button>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialogOverlay>
                    </AlertDialog>
                </Flex>
                <Box mt={"auto"}>
                    {/* <Button size="lg" colorScheme="orange" rightIcon={<FontAwesomeIcon icon={faSave} />} onClick={() => router.back()}>
                        Send it
                    </Button> */}
                </Box>
            </Flex>

            {generatedPaymentLink && (
                <PaymentLinkModal showOpenButton={false} isOpen={paymentLinkIsOpen} onClose={paymentLinkOnClose} paymentLink={generatedPaymentLink} />
            )}
            {manualPaymentMoneyHolder && request?.paidBy && (
                <ManualPaymentModal
                    isOpen={manualPaymentIsOpen}
                    onClose={manualPaymentOnClose}
                    moneyReceiver={request.paidBy}
                    moneyHolder={manualPaymentMoneyHolder}
                    onSubmit={() => {
                        void mutateRequest();
                        manualPaymentOnClose();
                    }}
                />
            )}
        </Flex>
    );
}

function PayingUserListItem(props: {
    request: PaymentRequest & { paidBy: User };
    isDisabled: boolean;
    payingUser: {
        user: User;
        partsOfAmount: number;
    };
    totalParts: number;
    onManualPayment: () => void;
    onPaymentLink: (otherWay: boolean, instant: boolean) => void;
    onChangeFraction: (newFraction: number) => void;
    onRemove: () => void;
    onSetPayingUser: () => void;
}) {
    const e = props.payingUser;
    const { data: sessionData } = useSession();

    return (
        <ListItem my={1} display="flex" key={e.user.id} alignItems="center" gap={2}>
            <Tooltip label={e.user.email} openDelay={200}>
                <Avatar size="sm" name={e.user.userName || e.user.email} src={e.user.avatarUrl || undefined} />
            </Tooltip>

            <Tooltip label={e.user.email} openDelay={200}>
                <Text wordBreak="break-word" fontWeight="normal">
                    {getUserDisplayName(e.user, sessionData?.user)}
                </Text>
            </Tooltip>

            {/* {e.user.email !== sessionData?.user?.email && ( */}
            <PaymentStatusButton
                onManualPayment={props.onManualPayment}
                onPaymentLink={props.onPaymentLink}
                onSetPayingUser={props.onSetPayingUser}
                isDisabled={props.isDisabled}
                userToPay={e as any}
                request={props.request}
                totalParts={props.totalParts}
            />
            {/* )} */}

            <Spacer />

            <Popover>
                <PopoverTrigger>
                    <Button variant="link" color="green.500" mx={1} fontWeight="semibold" whiteSpace="nowrap">
                        € {((e.partsOfAmount / props.totalParts) * props.request.amount).toFixed(2)}
                    </Button>
                </PopoverTrigger>
                <PopoverContent>
                    <PopoverArrow />
                    <PopoverCloseButton />
                    <PopoverHeader>Fraction of total amount</PopoverHeader>
                    <PopoverBody>
                        <Flex alignItems="center" gap={2}>
                            <IconButton
                                onClick={() => {
                                    props.onChangeFraction(e.partsOfAmount - 1);
                                }}
                                colorScheme="blue"
                                isDisabled={props.isDisabled || e.partsOfAmount <= 1}
                                aria-label="Less fraction of amount"
                                icon={<FontAwesomeIcon icon={faSubtract} />}></IconButton>
                            <Text px={2} as="span">
                                {e.partsOfAmount}
                            </Text>
                            <IconButton
                                isDisabled={props.isDisabled}
                                onClick={() => {
                                    props.onChangeFraction(e.partsOfAmount + 1);
                                }}
                                colorScheme="blue"
                                aria-label="More fraction of amount"
                                icon={<FontAwesomeIcon icon={faPlus} />}></IconButton>
                            {/* <Text whiteSpace={"nowrap"} as="p" opacity={0.5}>
                    parts of {request.amount}.
                </Text> */}
                        </Flex>
                    </PopoverBody>
                </PopoverContent>
            </Popover>

            <IconButton
                isDisabled={props.isDisabled}
                onClick={props.onRemove}
                size="sm"
                colorScheme="red"
                aria-label="Remove user"
                icon={<FontAwesomeIcon icon={faTimes} />}></IconButton>
        </ListItem>
    );
}

function ManualPaymentModal(props: { isOpen: boolean; onClose: () => void; moneyHolder: User; onSubmit: () => void; moneyReceiver: User }) {
    const [direction, setDirection] = useState<null | boolean>(null);
    const [amount, setAmount] = useState("0");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<"transfer-not-allowed-user" | null>(null);

    async function submit() {
        setSubmitting(true);
        setError(null);
        try {
            const res = await fetch("/api/balance", {
                method: "PATCH",
                body: JSON.stringify({
                    amount: direction ? -parseFloat(amount) : parseFloat(amount),
                    moneyHolderId: props.moneyHolder.id,
                    moneyReceiverId: props.moneyReceiver.id,
                }),
            });
            if (res.ok) {
                props.onSubmit();
            } else {
                setError("transfer-not-allowed-user");
            }
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <Modal isOpen={props.isOpen} onClose={props.onClose}>
            <ModalOverlay />
            <ModalContent>
                <ModalHeader>Add manual payment</ModalHeader>
                <ModalCloseButton />
                <form
                    onSubmit={(ev) => {
                        ev.preventDefault();
                        if (!(parseFloat(amount) >= 0.01)) {
                            return;
                        }
                        void submit();
                    }}>
                    <ModalBody display="flex" flexDir="column" gap={4}>
                        {error === "transfer-not-allowed-user" && (
                            <Alert status="error" rounded="lg" flexDir="column">
                                <Flex>
                                    <AlertIcon />
                                    <AlertTitle>Transfer failed</AlertTitle>
                                </Flex>
                                <AlertDescription textAlign="center">
                                    Only {getUserDisplayName(props.moneyReceiver)} can mark payments as paid according to their settings.
                                </AlertDescription>
                            </Alert>
                        )}

                        <FormControl isDisabled={submitting}>
                            <FormLabel>Select payment direction</FormLabel>
                            <Flex bg="gray.100" p={2} rounded="lg" flexDir="column" alignItems="center" gap={2}>
                                <Text>
                                    <Avatar
                                        mx={1}
                                        size="xs"
                                        name={getUserDisplayName(props.moneyHolder)}
                                        src={props.moneyHolder.avatarUrl || undefined}
                                    />{" "}
                                    {getUserDisplayName(props.moneyHolder)}
                                </Text>
                                <Flex gap={2} alignItems="center">
                                    <Text opacity={direction === true ? 0.5 : 0}>€ {amount}</Text>
                                    <IconButton
                                        aria-label="Send money"
                                        isDisabled={submitting}
                                        type="button"
                                        variant={direction === true ? "outline" : "solid"}
                                        onClick={() => setDirection(true)}
                                        colorScheme="blue"
                                        icon={<FontAwesomeIcon icon={faArrowDown} />}></IconButton>

                                    <IconButton
                                        aria-label="Received money"
                                        isDisabled={submitting}
                                        type="button"
                                        variant={direction === false ? "outline" : "solid"}
                                        onClick={() => setDirection(false)}
                                        colorScheme="blue"
                                        icon={<FontAwesomeIcon icon={faArrowUp} />}></IconButton>
                                    <Text opacity={direction === false ? 0.5 : 0}>€ {amount}</Text>
                                </Flex>
                                <Text>
                                    <Avatar
                                        mx={1}
                                        size="xs"
                                        name={getUserDisplayName(props.moneyReceiver)}
                                        src={props.moneyReceiver.avatarUrl || undefined}
                                    />{" "}
                                    {getUserDisplayName(props.moneyReceiver)}
                                </Text>
                            </Flex>
                        </FormControl>

                        {direction !== null && (
                            <FormControl isDisabled={submitting}>
                                <FormLabel>Amount</FormLabel>
                                <NumberInput
                                    onBlur={(ev) => {
                                        setAmount(ev.target.value);
                                    }}
                                    autoFocus
                                    value={amount}
                                    onChange={(ev) => setAmount(ev)}
                                    max={100000}
                                    min={1}>
                                    <InputGroup>
                                        <InputLeftAddon>€</InputLeftAddon>
                                        <NumberInputField borderLeftRadius={0} />
                                    </InputGroup>
                                    <NumberInputStepper>
                                        <NumberIncrementStepper />
                                        <NumberDecrementStepper />
                                    </NumberInputStepper>
                                </NumberInput>

                                {/* <FormHelperText>Paid by you. This amount will be divided over your friends.</FormHelperText> */}
                            </FormControl>
                        )}
                    </ModalBody>

                    <ModalFooter>
                        <Button variant="ghost" colorScheme="blue" mr={3} onClick={props.onClose} type="button">
                            Close
                        </Button>
                        <Button
                            isLoading={submitting}
                            leftIcon={<FontAwesomeIcon icon={faCoins} />}
                            isDisabled={submitting || !(parseFloat(amount) >= 0.01)}
                            colorScheme="green"
                            type="submit">
                            Add manual payment
                        </Button>
                    </ModalFooter>
                </form>
            </ModalContent>
        </Modal>
    );
}

function PaymentLinkModal(props: { isOpen: boolean; onClose: () => void; paymentLink: string; showOpenButton: boolean }) {
    const [copied, setCopied] = useState(false);
    return (
        <Modal isOpen={props.isOpen} onClose={props.onClose}>
            <ModalOverlay />
            <ModalContent>
                <ModalHeader>Payment link</ModalHeader>
                <ModalCloseButton />
                <ModalBody display="flex" flexDir="column" gap={4}>
                    {props.showOpenButton && (
                        <Button
                            colorScheme="green"
                            onClick={() => {
                                window.open(props.paymentLink, "_blank");
                                props.onClose();
                            }}
                            rightIcon={<FontAwesomeIcon icon={faArrowRight} />}>
                            Pay now
                        </Button>
                    )}
                    <Button
                        colorScheme="green"
                        onClick={() => {
                            void navigator.clipboard.writeText(props.paymentLink);
                            setCopied(true);
                        }}
                        leftIcon={<FontAwesomeIcon icon={copied ? faClipboardCheck : faClipboard} />}>
                        {copied ? <>Copied!</> : <>Copy link to clipboard</>}
                    </Button>
                    <QRCode
                        size={256}
                        viewBox={`0 0 256 256`}
                        style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                        value={props.paymentLink}
                    />
                </ModalBody>

                <ModalFooter>
                    <Button colorScheme="blue" mr={3} onClick={props.onClose}>
                        Close
                    </Button>
                </ModalFooter>
            </ModalContent>
        </Modal>
    );
}

function PaymentStatusButton(props: {
    // paidBy: User;
    userToPay: PaymentRequestToUser & {
        user: User & { holdsMoneyFrom: RelativeUserBalance[]; shouldReceiveMoneyFrom: RelativeUserBalance[] };
    };
    totalParts: number;
    request: PaymentRequest & { paidBy: User };
    isDisabled: boolean;

    onPaymentLink: (otherWay: boolean, instant: boolean) => void;
    onManualPayment: () => void;
    onSetPayingUser: () => void;
}) {
    const { status, data: sessionData } = useSession();
    const lastPaymentDate = props.userToPay.user.holdsMoneyFrom[0]?.lastPaymentDate;
    const amount = (props.userToPay.user.holdsMoneyFrom[0]?.amount ?? 0) - (props.userToPay.user.shouldReceiveMoneyFrom[0]?.amount ?? 0);

    return (
        <Popover>
            <PopoverTrigger>
                <IconButton
                    colorScheme={Math.abs(amount) < 0.01 ? "green" : amount > 0 ? "blue" : "blue"}
                    size="xs"
                    rounded={"full"}
                    variant="solid"
                    aria-label="Payment status"
                    icon={<FontAwesomeIcon icon={Math.abs(amount) < 0.01 ? faCheck : amount >= 0.01 ? faHourglass : faWarning} />}
                />
            </PopoverTrigger>
            <PopoverContent>
                <PopoverArrow />
                <PopoverCloseButton />
                <PopoverHeader>Payment status</PopoverHeader>
                <PopoverBody display="flex" gap={2} flexDir="column">
                    {Math.abs(amount) < 0.01 ? (
                        <Text as="p" color="green.500" fontWeight="semibold">
                            <FontAwesomeIcon icon={faCheckCircle} /> {getUserDisplayName(props.request.paidBy, sessionData?.user)} and{" "}
                            {getUserDisplayName(props.userToPay.user, sessionData?.user)} are even
                        </Text>
                    ) : amount >= 0.01 ? (
                        <Text as="p" color="yellow.500" fontWeight="semibold">
                            <FontAwesomeIcon icon={faExclamationTriangle} /> {getUserDisplayName(props.userToPay.user, sessionData?.user)} still ows{" "}
                            {getUserDisplayName(props.request.paidBy, sessionData?.user)} €{amount.toFixed(2)}
                        </Text>
                    ) : (
                        <Text as="p" color="yellow.500" fontWeight="semibold">
                            <FontAwesomeIcon icon={faExclamationTriangle} /> {getUserDisplayName(props.request.paidBy, sessionData?.user)} still ows{" "}
                            {getUserDisplayName(props.userToPay.user, sessionData?.user)} €{-amount.toFixed(2)} back
                        </Text>
                    )}

                    {amount >= 0.01 && (
                        <Text as="p" opacity={0.5}>
                            {getUserDisplayName(props.userToPay.user, sessionData?.user)} will be notified periodically (weekly) if they haven&apos;t
                            paid. You can also share a payment link/pay by pressing the green button.
                        </Text>
                    )}

                    <Divider />

                    {(amount <= -0.01 && sessionData?.user?.email === props.request.paidBy.email) ||
                    (amount >= 0.01 && sessionData?.user?.email === props.userToPay.user.email) ? (
                        <Button
                            isDisabled={props.isDisabled}
                            onClick={() => props.onPaymentLink(amount < 0, true)}
                            colorScheme="green"
                            rightIcon={<FontAwesomeIcon icon={faArrowRight} />}>
                            Pay back now
                        </Button>
                    ) : Math.abs(amount) >= 0.01 ? (
                        <Button
                            variant="solid"
                            isDisabled={props.isDisabled}
                            onClick={() => props.onPaymentLink(amount < 0, false)}
                            colorScheme="green"
                            // size="sm"
                            leftIcon={<FontAwesomeIcon icon={faLink} />}>
                            Show payment link
                        </Button>
                    ) : (
                        <></>
                    )}

                    {props.userToPay.userId !== props.request.paidById && (
                        <Button
                            isDisabled={props.isDisabled}
                            variant="ghost"
                            onClick={props.onManualPayment}
                            colorScheme="blue"
                            size="sm"
                            leftIcon={<FontAwesomeIcon icon={faMoneyBill} />}>
                            Add manual payment
                        </Button>
                    )}

                    {props.request.paidBy.id !== props.userToPay.userId && (
                        <Button
                            isDisabled={props.isDisabled}
                            variant="ghost"
                            onClick={props.onSetPayingUser}
                            colorScheme="blue"
                            size="sm"
                            leftIcon={<FontAwesomeIcon icon={faUserCheck} />}>
                            Set as paying user
                        </Button>
                    )}
                </PopoverBody>
                {lastPaymentDate && (
                    <PopoverFooter>
                        <Text as="p" opacity={0.5} fontSize="xs">
                            <>
                                Last payment at{" "}
                                <Text fontWeight="normal" as="span">
                                    {new Date(lastPaymentDate).toLocaleString()}
                                </Text>
                            </>
                        </Text>
                    </PopoverFooter>
                )}
            </PopoverContent>
        </Popover>
    );
}
