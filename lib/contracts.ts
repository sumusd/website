import type {Address} from "viem";

/// Deployment addresses per chain id. Fill these in after running the Foundry deploy script.
/// Values are read from NEXT_PUBLIC_* env vars so the same build works across networks.
export const ENGINE_ADDRESS = (process.env.NEXT_PUBLIC_ENGINE_ADDRESS ?? "0x0000000000000000000000000000000000000000") as Address;
export const SUMUSD_ADDRESS = (process.env.NEXT_PUBLIC_SUMUSD_ADDRESS ?? "0x0000000000000000000000000000000000000000") as Address;

/// A collateral flavor. The basket is governance-curated and can change without a rebuild, so flavors
/// are never hardcoded — they are discovered on-chain from the engine (see lib/useCollaterals.ts):
/// `listedCollaterals()` gives the addresses, `configs(token)` the cached decimals + status, and the
/// token's `symbol()` the label.
export interface Collateral {
    symbol: string;
    address: Address;
    decimals: number;
    enabled: boolean; // deposits allowed (redemption stays open even when false / frozen)
    backingExcluded: boolean; // "siloed": value not counted toward backing/tilt
}

/// Minimal ABI for the engine — only what the frontend calls.
export const ENGINE_ABI = [
    {
        type: "function",
        name: "deposit",
        stateMutability: "nonpayable",
        inputs: [
            {name: "collateral", type: "address"},
            {name: "amount", type: "uint256"},
            {name: "minSumUsdOut", type: "uint256"},
        ],
        outputs: [{name: "minted", type: "uint256"}],
    },
    {
        type: "function",
        name: "redeem",
        stateMutability: "nonpayable",
        inputs: [
            {name: "collateral", type: "address"},
            {name: "sumUsdAmount", type: "uint256"},
            {name: "minCollateralOut", type: "uint256"},
        ],
        outputs: [{name: "collateralOut", type: "uint256"}],
    },
    {
        type: "function",
        name: "redeemBatch",
        stateMutability: "nonpayable",
        inputs: [
            {name: "collaterals", type: "address[]"},
            {name: "sumUsdAmounts", type: "uint256[]"},
            {name: "minOuts", type: "uint256[]"},
        ],
        outputs: [{name: "collateralOuts", type: "uint256[]"}],
    },
    {
        type: "function",
        name: "previewRedeemBatch",
        stateMutability: "view",
        inputs: [
            {name: "collaterals", type: "address[]"},
            {name: "sumUsdAmounts", type: "uint256[]"},
        ],
        outputs: [{name: "nets", type: "uint256[]"}],
    },
    {
        type: "function",
        name: "previewDeposit",
        stateMutability: "view",
        inputs: [
            {name: "collateral", type: "address"},
            {name: "amount", type: "uint256"},
        ],
        outputs: [{name: "", type: "uint256"}],
    },
    {
        type: "function",
        name: "previewRedeem",
        stateMutability: "view",
        inputs: [
            {name: "collateral", type: "address"},
            {name: "sumUsdAmount", type: "uint256"},
        ],
        outputs: [{name: "", type: "uint256"}],
    },
    {
        type: "function",
        name: "redeemMix",
        stateMutability: "nonpayable",
        inputs: [
            {name: "sumUsdAmount", type: "uint256"},
            {name: "minOut", type: "uint256[]"},
        ],
        outputs: [{name: "amounts", type: "uint256[]"}],
    },
    {
        type: "function",
        name: "previewRedeemMix",
        stateMutability: "view",
        inputs: [{name: "sumUsdAmount", type: "uint256"}],
        outputs: [
            {name: "tokens", type: "address[]"},
            {name: "amounts", type: "uint256[]"},
        ],
    },
    {
        type: "function",
        name: "poolNeeds",
        stateMutability: "view",
        inputs: [],
        outputs: [{name: "", type: "address"}],
    },
    // On-chain flavor discovery: the full listed set, and per-token config (cached decimals + status).
    {
        type: "function",
        name: "listedCollaterals",
        stateMutability: "view",
        inputs: [],
        outputs: [{name: "", type: "address[]"}],
    },
    {
        type: "function",
        name: "configs",
        stateMutability: "view",
        inputs: [{name: "token", type: "address"}],
        outputs: [
            {name: "enabled", type: "bool"},
            {name: "decimals", type: "uint8"},
            {name: "redeemRateBps", type: "uint16"},
            {name: "oracle", type: "address"},
            {name: "backingExcluded", type: "bool"},
        ],
    },
    {
        type: "function",
        name: "currentRedeemRateBps",
        stateMutability: "view",
        inputs: [{name: "collateral", type: "address"}],
        outputs: [{name: "", type: "uint256"}],
    },
    {
        type: "function",
        name: "systemCollateralizationRatioBps",
        stateMutability: "view",
        inputs: [],
        outputs: [{name: "ratioBps", type: "uint256"}],
    },
    {
        type: "function",
        name: "totalCollateralValueUsd",
        stateMutability: "view",
        inputs: [],
        outputs: [{name: "total", type: "uint256"}],
    },
    {
        type: "function",
        name: "collateralValueUsd",
        stateMutability: "view",
        inputs: [{name: "collateral", type: "address"}],
        outputs: [{name: "", type: "uint256"}],
    },
    // Price-feed health. `livePriceWad` is the raw current oracle read (ok=false => feed down);
    // `valuationPriceWad` is the price actually used for backing (live, or the haircut last-good
    // fallback within its grace window, else 0); `lastGoodPriceAt` is when the cache was last warmed.
    {
        type: "function",
        name: "livePriceWad",
        stateMutability: "view",
        inputs: [{name: "collateral", type: "address"}],
        outputs: [
            {name: "priceWad", type: "uint256"},
            {name: "ok", type: "bool"},
        ],
    },
    {
        type: "function",
        name: "valuationPriceWad",
        stateMutability: "view",
        inputs: [{name: "collateral", type: "address"}],
        outputs: [{name: "", type: "uint256"}],
    },
    {
        type: "function",
        name: "lastGoodPriceAt",
        stateMutability: "view",
        inputs: [{name: "token", type: "address"}],
        outputs: [{name: "", type: "uint256"}],
    },
] as const;

/// Standard ERC-20 subset for balances, allowances, approvals, and the display symbol.
export const ERC20_ABI = [
    {
        type: "function",
        name: "symbol",
        stateMutability: "view",
        inputs: [],
        outputs: [{name: "", type: "string"}],
    },
    {
        type: "function",
        name: "balanceOf",
        stateMutability: "view",
        inputs: [{name: "account", type: "address"}],
        outputs: [{name: "", type: "uint256"}],
    },
    {
        type: "function",
        name: "allowance",
        stateMutability: "view",
        inputs: [
            {name: "owner", type: "address"},
            {name: "spender", type: "address"},
        ],
        outputs: [{name: "", type: "uint256"}],
    },
    {
        type: "function",
        name: "approve",
        stateMutability: "nonpayable",
        inputs: [
            {name: "spender", type: "address"},
            {name: "amount", type: "uint256"},
        ],
        outputs: [{name: "", type: "bool"}],
    },
] as const;
