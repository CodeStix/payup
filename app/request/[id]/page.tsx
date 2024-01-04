"use client";

import { AppHeader } from "@/components/AppHeader";
import { EditableControls } from "@/components/EditableControls";
import { LogOutButton } from "@/components/LogOutButton";
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
} from "@chakra-ui/react";
import {
    faCheck,
    faCheckCircle,
    faCheckDouble,
    faChevronLeft,
    faCoins,
    faHourglass,
    faMoneyBill,
    faMoneyBill1Wave,
    faPlus,
    faSave,
    faSearch,
    faSubtract,
    faTimes,
    faTrash,
    faWarning,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { PaymentRequest, PaymentRequestToUser, RelativeUserBalance, User } from "@prisma/client";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";

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

    async function patch(n: Partial<PaymentRequest & { usersToPay: { user: { id: number }; partsOfAmount: number }[] }>) {
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
                usersToPay: [...request.usersToPay.filter((e) => e.user.id !== user.id), { user: user, partsOfAmount: partsOfAmount }],
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
        const amount = parseFloat(amountStr);
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
                                <NumberInput
                                    onBlur={(ev) => {
                                        setAmount(ev.target.value);
                                        void updateAmount(ev.target.value);
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

                                <FormHelperText>Paid by you. This amount will be divided over your friends.</FormHelperText>
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
                                    <InputLeftElement pointerEvents="none" opacity={0.3}>
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
                            {filteredSearchResults.length === 0 ? "No results" : userQuery ? "Search results" : "Recommended users"}
                        </Text>
                        <UnorderedList ml={0}>
                            {filteredSearchResults.map((u) => (
                                <ListItem my={1} display="flex" key={u.id} alignItems="center" gap={2}>
                                    <Avatar size="sm" name={u.userName || u.email} src={u.avatarUrl || undefined} />
                                    <Text wordBreak="break-word" fontWeight="normal">
                                        {u.userName || removeEmailDomain(u.email)}{" "}
                                        {u.email === sessionData?.user?.email && (
                                            <Text as="span" opacity={0.5}>
                                                (you)
                                            </Text>
                                        )}
                                    </Text>
                                    <Spacer />
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

                    <Divider />

                    <Skeleton isLoaded={!!request}>
                        {(request?.usersToPay.length ?? 0) > 0 && (
                            <Text as="p" fontWeight="bold" color="green.500">
                                <FontAwesomeIcon icon={faCoins} /> Paying users
                            </Text>
                        )}
                        <UnorderedList ml={0}>
                            {request?.usersToPay.map((e) => (
                                <ListItem my={1} display="flex" key={e.user.id} alignItems="center" gap={2}>
                                    <Avatar size="sm" name={e.user.userName || e.user.email} src={e.user.avatarUrl || undefined} />
                                    <Text wordBreak="break-word" fontWeight="normal">
                                        {e.user.userName || removeEmailDomain(e.user.email)}
                                    </Text>
                                    <Spacer />

                                    <PaymentStatusButton
                                        onMarkPaid={(a) => {
                                            // void bindUser(e.user, e.partsOfAmount, a);
                                        }}
                                        isDisabled={isUpdating}
                                        userToPay={e as any}
                                        request={request}
                                        totalParts={totalParts}
                                    />

                                    <Popover>
                                        <PopoverTrigger>
                                            <Button variant="link" color="green.500" mx={1} fontWeight="semibold" whiteSpace="nowrap">
                                                € {((e.partsOfAmount / totalParts) * request.amount).toFixed(2)}
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
                                                            void bindUser(e.user, e.partsOfAmount - 1);
                                                        }}
                                                        colorScheme="blue"
                                                        isDisabled={isUpdating || e.partsOfAmount <= 1}
                                                        aria-label="Less fraction of amount"
                                                        icon={<FontAwesomeIcon icon={faSubtract} />}></IconButton>
                                                    <Text px={2} as="span">
                                                        {e.partsOfAmount}
                                                    </Text>
                                                    <IconButton
                                                        isDisabled={isUpdating}
                                                        onClick={() => {
                                                            void bindUser(e.user, e.partsOfAmount + 1);
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
                                        isDisabled={isUpdating}
                                        onClick={() => void unbindUser(e.user)}
                                        size="sm"
                                        colorScheme="red"
                                        aria-label="Remove user"
                                        icon={<FontAwesomeIcon icon={faTimes} />}></IconButton>
                                </ListItem>
                            ))}
                        </UnorderedList>
                    </Skeleton>

                    <Divider />

                    <Skeleton isLoaded={!!request}>
                        <Button w="full" colorScheme="red" leftIcon={<FontAwesomeIcon icon={faTrash} />} onClick={() => onOpenDelete()}>
                            Delete payment request
                        </Button>
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
        </Flex>
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
    onMarkPaid: (payedAmount: number) => void;
}) {
    const lastPaymentDate = props.userToPay.user.holdsMoneyFrom[0]?.lastPaymentDate;
    const amount = (props.userToPay.user.holdsMoneyFrom[0]?.amount ?? 0) - (props.userToPay.user.shouldReceiveMoneyFrom[0]?.amount ?? 0);

    return (
        <Popover>
            <PopoverTrigger>
                <IconButton
                    colorScheme={amount === 0 ? "green" : amount > 0 ? "blue" : "blue"}
                    size="xs"
                    rounded={"full"}
                    variant="solid"
                    aria-label="Payment status"
                    icon={<FontAwesomeIcon icon={amount === 0 ? faCheck : amount > 0 ? faHourglass : faWarning} />}
                />
            </PopoverTrigger>
            <PopoverContent pr={4} w="400px">
                <PopoverArrow />
                <PopoverCloseButton />
                <PopoverHeader>
                    {amount === 0 ? (
                        <>
                            {getUserDisplayName(props.request.paidBy)} and {getUserDisplayName(props.userToPay.user)} are even
                        </>
                    ) : amount > 0 ? (
                        <>
                            {getUserDisplayName(props.userToPay.user)} still ows {getUserDisplayName(props.request.paidBy)} €{amount.toFixed(2)}
                        </>
                    ) : (
                        <>
                            {getUserDisplayName(props.request.paidBy)} ows {getUserDisplayName(props.userToPay.user)} €{-amount.toFixed(2)} back
                        </>
                    )}
                    {/* Payment status:{" "}
                    {paidLess ? (
                        <Text as="span" fontWeight="semibold" color="red.500">
                            <FontAwesomeIcon icon={faWarning} /> Didn&apos;t pay enough
                        </Text>
                    ) : paidTooMuch ? (
                        <Text as="span" fontWeight="semibold" color="green.500">
                            <FontAwesomeIcon icon={faWarning} /> Paid too much
                        </Text>
                    ) : paid ? (
                        <Text as="span" fontWeight="semibold" color="green.500">
                            <FontAwesomeIcon icon={faCheckCircle} /> Paid
                        </Text>
                    ) : (
                        <Text as="span" fontWeight="semibold">
                            Waiting for payment
                        </Text>
                    )} */}
                </PopoverHeader>
                <PopoverBody display="flex" gap={2} flexDir="column">
                    {/* {paidTooMuch && (
                        <Text as="p" opacity={0.5}>
                            But don&apos;t worry, you will be notified automatically when you should pay it back.
                        </Text>
                    )}
                    {paidLess && (
                        <Text as="p" opacity={0.5}>
                            But don&apos;t worry, they will be notified automatically when they should pay you again.
                        </Text>
                    )}

                    <Text as="p">
                        <Text fontWeight="semibold" as="span">
                            €{props.userToPay.payedAmount.toFixed(2)}
                        </Text>{" "}
                        /{" "}
                        <Text fontWeight="semibold" as="span">
                            €{shouldPay.toFixed(2)}
                        </Text>{" "}
                        paid.{" "}
                    </Text>

                    {(paidLess || !paid) && (
                        <Button
                            isDisabled={props.isDisabled}
                            onClick={() => props.onMarkPaid(shouldPay)}
                            colorScheme="green"
                            size="sm"
                            leftIcon={<FontAwesomeIcon icon={faCheckCircle} />}>
                            Mark as fully paid
                        </Button>
                    )} */}
                </PopoverBody>
                <PopoverFooter>
                    <Text as="p" opacity={0.5} fontSize="xs">
                        {lastPaymentDate && (
                            <>
                                Last payment at{" "}
                                <Text fontWeight="normal" as="span">
                                    {new Date(lastPaymentDate).toLocaleString()}
                                </Text>
                            </>
                        )}
                    </Text>
                </PopoverFooter>
            </PopoverContent>
        </Popover>
    );
}
