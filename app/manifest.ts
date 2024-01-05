import { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: "Pay Up!",
        short_name: "Pay Up!",
        description: "Automatically get paid and reminded about payments.",
        start_url: "/",
        display: "standalone",
        background_color: "#fff",
        theme_color: "#dd6b20",
        icons: [
            {
                src: "/orange_96.png",
                sizes: "96x96",
            },
            {
                src: "/orange_256.png",
                sizes: "256x256",
            },
            {
                src: "/orange.svg",
                sizes: "any",
            },
        ],
    };
}
