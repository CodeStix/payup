import { capitalize, fetcher, getUserDisplayName, paymentMethods } from "@/util";
import {
    Modal,
    Text,
    ModalOverlay,
    ModalContent,
    ModalHeader,
    ModalCloseButton,
    ModalBody,
    ModalFooter,
    Button,
    Flex,
    Select,
    FormControl,
    FormErrorMessage,
    FormHelperText,
    FormLabel,
    Input,
    Link,
    Skeleton,
} from "@chakra-ui/react";
import { faArrowRight, faCheck } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { PaymentMethod, User } from "@prisma/client";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import useSWR from "swr";

export function PaymentMethodModal(props: { isOpen: boolean; onClose: (cancelled: boolean) => void; notOwnUserId?: number }) {
    const { data: sessionData } = useSession();
    const { data: user, isLoading: isLoadingUser } = useSWR<User>(
        props.isOpen ? (props.notOwnUserId ? `/api/user/${props.notOwnUserId}` : "/api/user") : undefined,
        fetcher
    );
    const [iban, setIban] = useState("");
    const [mollieApiKey, setMollieApiKey] = useState("");
    const [method, setMethod] = useState<PaymentMethod>();
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (props.isOpen) {
            setErrors({});
        }
    }, [props.isOpen]);

    useEffect(() => {
        if (!method && typeof user?.preferredPaymentMethod === "string") {
            setMethod(user.preferredPaymentMethod);
        }
        if (!iban && typeof user?.iban === "string") {
            setIban(user.iban);
        }
        if (!mollieApiKey && typeof user?.mollieApiKey === "string") {
            setMollieApiKey(user.mollieApiKey);
        }
    }, [user]);

    async function saveChanges() {
        setSaving(true);
        setErrors({});
        try {
            const res = await fetch(props.notOwnUserId ? `/api/user/${props.notOwnUserId}` : "/api/user", {
                method: "PATCH",
                body: JSON.stringify({
                    preferredPaymentMethod: method,
                    iban: method === "IBAN" ? iban : undefined,
                    mollieApiKey: method === "MOLLIE" ? mollieApiKey : undefined,
                }),
            });
            if (res.ok) {
                props.onClose(false);
            } else {
                setErrors(await res.json());
            }
        } finally {
            setSaving(false);
        }
    }

    return (
        <Modal isOpen={props.isOpen} onClose={() => props.onClose(true)}>
            <ModalOverlay />
            <ModalContent>
                <ModalHeader>Payment method required</ModalHeader>
                <ModalCloseButton />
                <form
                    onSubmit={(ev) => {
                        ev.preventDefault();
                        void saveChanges();
                    }}>
                    <ModalBody gap={6} display="flex" flexDir="column">
                        <Flex gap={2} alignItems="center">
                            <Text>How would {user && getUserDisplayName(user, sessionData?.user)} like to get paid?</Text>
                            <Select
                                isDisabled={!!props.notOwnUserId}
                                w="200px"
                                variant="filled"
                                value={method}
                                onChange={(ev) => setMethod(ev.target.value as PaymentMethod)}>
                                {paymentMethods.map((e) => (
                                    <option key={e}>{e}</option>
                                ))}
                            </Select>
                        </Flex>

                        <Skeleton isLoaded={!isLoadingUser}>
                            {method === "IBAN" && (
                                <FormControl isInvalid={"iban" in errors} isDisabled={saving || isLoadingUser}>
                                    <FormLabel>
                                        {props.notOwnUserId ? <>{user && getUserDisplayName(user, sessionData?.user)}'s IBAN</> : "IBAN"}
                                    </FormLabel>
                                    <Input
                                        autoFocus
                                        placeholder="example: NLxx xxxx xxxx xxxx"
                                        type="text"
                                        value={iban}
                                        onChange={(ev) => setIban(ev.target.value)}
                                    />
                                    {"iban" in errors ? (
                                        <FormErrorMessage>{errors["iban"]}</FormErrorMessage>
                                    ) : (
                                        <FormHelperText>
                                            {user && getUserDisplayName(user, sessionData?.user)} can only receive money using this number. You can
                                            find this in your banking app.
                                        </FormHelperText>
                                    )}
                                </FormControl>
                            )}

                            {method === "MOLLIE" && (
                                <FormControl isInvalid={"mollieApiKey" in errors} isDisabled={saving || isLoadingUser}>
                                    <FormLabel>Mollie API key</FormLabel>
                                    <Input
                                        autoFocus
                                        placeholder="example: test_xxxxxxxxxx"
                                        type="password"
                                        value={mollieApiKey}
                                        onChange={(ev) => setMollieApiKey(ev.target.value)}
                                    />
                                    {"mollieApiKey" in errors ? (
                                        <FormErrorMessage>{errors["mollieApiKey"]}</FormErrorMessage>
                                    ) : (
                                        <FormHelperText>
                                            Visit the{" "}
                                            <Link target="_blank" href="https://mollie.com">
                                                mollie
                                            </Link>{" "}
                                            site to see what&apos;s up. Payments will be automatically confirmed using this method.
                                        </FormHelperText>
                                    )}
                                </FormControl>
                            )}
                        </Skeleton>
                    </ModalBody>

                    <ModalFooter>
                        <Button colorScheme="blue" mr={3} variant="ghost" onClick={() => props.onClose(true)}>
                            Cancel
                        </Button>
                        <Button rightIcon={<FontAwesomeIcon icon={faCheck} />} isDisabled={isLoadingUser || saving} colorScheme="green" type="submit">
                            Save
                        </Button>
                    </ModalFooter>
                </form>
            </ModalContent>
        </Modal>
    );
}
