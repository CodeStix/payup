import { Button } from "@chakra-ui/react";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogOutButton() {
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    return (
        <Button
            mt={"auto"}
            variant="outline"
            isDisabled={loading}
            colorScheme="red"
            onClick={async () => {
                setLoading(true);
                try {
                    await signOut();
                } finally {
                    location.href = "/";
                    setLoading(false);
                }
            }}>
            Log out
        </Button>
    );
}
