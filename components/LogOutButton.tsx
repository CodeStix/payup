import { Button, IconButton } from "@chakra-ui/react";
import { faSignOut } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogOutButton(props: { small?: boolean }) {
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    async function logOut() {
        setLoading(true);
        try {
            await signOut();
        } finally {
            location.href = "/";
            setLoading(false);
        }
    }

    return props.small ? (
        <IconButton
            icon={<FontAwesomeIcon icon={faSignOut} />}
            aria-label="sign out"
            variant="outline"
            isDisabled={loading}
            colorScheme="red"
            // size="sm"
            onClick={logOut}
        />
    ) : (
        <Button variant="outline" isDisabled={loading} colorScheme="red" onClick={logOut}>
            Sign out
        </Button>
    );
}
