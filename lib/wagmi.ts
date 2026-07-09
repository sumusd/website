import {getDefaultConfig} from "@rainbow-me/rainbowkit";
import {foundry, mainnet, sepolia} from "wagmi/chains";

// WalletConnect Cloud project id. Set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID in .env.local.
// The fallback only lets the app boot in development; production needs a real id.
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "DEMO_PROJECT_ID";

// In local dev (NEXT_PUBLIC_ENABLE_LOCAL=true) put the anvil/foundry chain first so contract
// reads resolve against it even without a connected wallet. Production builds keep mainnet + sepolia.
const chains =
    process.env.NEXT_PUBLIC_ENABLE_LOCAL === "true"
        ? ([foundry, mainnet, sepolia] as const)
        : ([mainnet, sepolia] as const);

export const wagmiConfig = getDefaultConfig({
    appName: "SumUSD",
    projectId,
    chains,
    ssr: true,
});
