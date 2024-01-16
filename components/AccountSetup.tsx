import { FormControl, Text, FormLabel, Input, FormErrorMessage, FormHelperText, Button } from "@chakra-ui/react";
import { faArrowRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useState } from "react";

export function AccountSetup(props: { onDone: () => void }) {
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
