import type {Metadata} from "next";
import Link from "next/link";
import {COLLATERALS} from "@/lib/contracts";

export const metadata: Metadata = {
    title: "SumUSD — Integrations",
    description:
        "Contract addresses, brand assets, and the on-chain function calls to mint, redeem, and batch-redeem SumUSD.",
    alternates: {canonical: "/integrations"},
};

// Core protocol contracts. Addresses are published per network at deployment; the frontend reads them
// from these NEXT_PUBLIC_* env vars (see lib/contracts.ts).
const CONTRACTS = [
    {name: "SumUSDEngine", role: "Mint / redeem entrypoint", env: "NEXT_PUBLIC_ENGINE_ADDRESS"},
    {name: "SumUSD", role: "The ERC-20 token (18 decimals)", env: "NEXT_PUBLIC_SUMUSD_ADDRESS"},
    {name: "ImmutableTimelock", role: "Governance owner (96h delay)", env: "— (published on deploy)"},
];

// Collateral flavors, paired to their frontend env vars by index (aligned to COLLATERALS).
const FLAVOR_ENV = ["NEXT_PUBLIC_FLAVOR_A", "NEXT_PUBLIC_FLAVOR_B", "NEXT_PUBLIC_FLAVOR_C"];

const NETWORKS = ["Ethereum mainnet", "Base", "Sepolia (testnet)"];

// Brand palette — the logo's emerald gradient plus the tinted near-black text color.
const SWATCHES = [
    {name: "Emerald 500", hex: "#22c55e", css: "bg-[#22c55e]"},
    {name: "Emerald 700", hex: "#15803d", css: "bg-[#15803d]"},
    {name: "Foreground", hex: "oklch(0.23 0.012 155)", css: "bg-black"},
];

// Every public entrypoint an integrator needs, with its 4-byte selector.
type Call = {name: string; target: "Engine" | "ERC-20"; write: boolean; sig: string; selector: string; desc: string};
const CALLS: Call[] = [
    {
        name: "approve",
        target: "ERC-20",
        write: true,
        sig: "approve(address spender, uint256 amount)",
        selector: "0x095ea7b3",
        desc: "Approve the engine to pull the collateral before minting. Called on the collateral token, not the engine. Not needed for redemptions.",
    },
    {
        name: "deposit",
        target: "Engine",
        write: true,
        sig: "deposit(address collateral, uint256 amount, uint256 minSumUsdOut) → uint256 minted",
        selector: "0x0efe6a8b",
        desc: "Mint SumUSD 1:1 from an accepted collateral (normalized for decimals). minSumUsdOut is slippage protection (0 to skip). Reverts if the price is off-peg or system backing is under 99%.",
    },
    {
        name: "redeem",
        target: "Engine",
        write: true,
        sig: "redeem(address collateral, uint256 sumUsdAmount, uint256 minCollateralOut) → uint256 collateralOut",
        selector: "0x2b83cccd",
        desc: "Burn SumUSD for one flavor at par minus the weight-tilt haircut and fee. minCollateralOut is in the flavor's decimals. No approval needed — the engine burns your SumUSD directly.",
    },
    {
        name: "redeemBatch",
        target: "Engine",
        write: true,
        sig: "redeemBatch(address[] collaterals, uint256[] sumUsdAmounts, uint256[] minOuts) → uint256[] collateralOuts",
        selector: "0xcbae8314",
        desc: "Redeem several flavors in one tx, each leg priced like an individual redeem on a single basket snapshot. The three arrays must be equal length and non-empty; any leg reverting reverts the whole call. Normal mode only.",
    },
    {
        name: "redeemMix",
        target: "Engine",
        write: true,
        sig: "redeemMix(uint256 sumUsdAmount, uint256[] minOut) → uint256[] amounts",
        selector: "0x351a7689",
        desc: "Distress exit, callable only when backing is below 99%: burn SumUSD for a pro-rata slice of the entire basket. Pass an empty minOut array to skip per-token slippage checks.",
    },
    {
        name: "previewDeposit",
        target: "Engine",
        write: false,
        sig: "previewDeposit(address collateral, uint256 amount) → uint256",
        selector: "0xb8f82b26",
        desc: "Quote the SumUSD a deposit would mint right now.",
    },
    {
        name: "previewRedeem",
        target: "Engine",
        write: false,
        sig: "previewRedeem(address collateral, uint256 sumUsdAmount) → uint256",
        selector: "0xcbe52ae3",
        desc: "Quote the net collateral a single-flavor redeem returns (haircut and fee included). Matches the redeem payout.",
    },
    {
        name: "previewRedeemBatch",
        target: "Engine",
        write: false,
        sig: "previewRedeemBatch(address[] collaterals, uint256[] sumUsdAmounts) → uint256[] nets",
        selector: "0xa7b46ea9",
        desc: "Quote each leg of a redeemBatch. Matches the batch payout leg-for-leg.",
    },
    {
        name: "previewRedeemMix",
        target: "Engine",
        write: false,
        sig: "previewRedeemMix(uint256 sumUsdAmount) → (address[] tokens, uint256[] amounts)",
        selector: "0x0281a0ed",
        desc: "Quote the pro-rata basket slice a distress exit would return.",
    },
    {
        name: "systemCollateralizationRatioBps",
        target: "Engine",
        write: false,
        sig: "systemCollateralizationRatioBps() → uint256 ratioBps",
        selector: "0x30912786",
        desc: "System backing in bps (10000 = 100%). Returns ~uint256 max before the first deposit. Below 9900 the system is distressed and single-flavor redemption is disabled.",
    },
    {
        name: "currentRedeemRateBps",
        target: "Engine",
        write: false,
        sig: "currentRedeemRateBps(address collateral) → uint256",
        selector: "0x272f0606",
        desc: "The current weight-tilt redemption rate for a flavor in bps (pre-fee).",
    },
];

const SOLIDITY = `interface ISumUSDEngine {
    // --- Mint ---
    function deposit(address collateral, uint256 amount, uint256 minSumUsdOut)
        external returns (uint256 minted);

    // --- Redeem ---
    function redeem(address collateral, uint256 sumUsdAmount, uint256 minCollateralOut)
        external returns (uint256 collateralOut);

    function redeemBatch(
        address[] calldata collaterals,
        uint256[] calldata sumUsdAmounts,
        uint256[] calldata minOuts
    ) external returns (uint256[] memory collateralOuts);

    // Distress-only pro-rata exit (below 99% backing)
    function redeemMix(uint256 sumUsdAmount, uint256[] calldata minOut)
        external returns (uint256[] memory amounts);

    // --- Quotes (view) ---
    function previewDeposit(address collateral, uint256 amount) external view returns (uint256);
    function previewRedeem(address collateral, uint256 sumUsdAmount) external view returns (uint256);
    function previewRedeemBatch(address[] calldata collaterals, uint256[] calldata sumUsdAmounts)
        external view returns (uint256[] memory nets);
    function previewRedeemMix(uint256 sumUsdAmount)
        external view returns (address[] memory tokens, uint256[] memory amounts);

    // --- Status (view) ---
    function systemCollateralizationRatioBps() external view returns (uint256 ratioBps);
    function currentRedeemRateBps(address collateral) external view returns (uint256);
}`;

const VIEM = `import {parseUnits} from "viem";
import {ENGINE_ABI, ERC20_ABI, ENGINE_ADDRESS} from "@/lib/contracts";

// --- Mint: approve the collateral, then deposit 1:1 ---
const amount = parseUnits("1000", 6); // a 6-decimal flavor
await wallet.writeContract({
  address: COLLATERAL, abi: ERC20_ABI, functionName: "approve",
  args: [ENGINE_ADDRESS, amount],
});
await wallet.writeContract({
  address: ENGINE_ADDRESS, abi: ENGINE_ABI, functionName: "deposit",
  args: [COLLATERAL, amount, 0n], // minSumUsdOut = 0n to skip slippage check
});

// --- Redeem one flavor (SumUSD is 18 decimals; no approval needed) ---
const burn = parseUnits("1000", 18);
await wallet.writeContract({
  address: ENGINE_ADDRESS, abi: ENGINE_ABI, functionName: "redeem",
  args: [COLLATERAL, burn, 0n], // minCollateralOut in the flavor's decimals
});

// --- redeemBatch: split one redemption across flavors in a single tx ---
await wallet.writeContract({
  address: ENGINE_ADDRESS, abi: ENGINE_ABI, functionName: "redeemBatch",
  args: [
    [FLAVOR_A, FLAVOR_C],                             // collaterals
    [parseUnits("600", 18), parseUnits("400", 18)],  // sumUSD burned per leg
    [0n, 0n],                                         // per-leg minOut
  ],
});

// --- Distress exit: when systemCollateralizationRatioBps() < 9900,
//     redeem / redeemBatch revert (UseRedeemMix). Exit pro-rata instead: ---
await wallet.writeContract({
  address: ENGINE_ADDRESS, abi: ENGINE_ABI, functionName: "redeemMix",
  args: [burn, []], // empty minOut skips per-token slippage checks
});`;

export default function IntegrationsPage() {
    return (
        <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-14 px-6 py-12 sm:py-16">
            <header className="flex items-center justify-between gap-4 border-b border-black/10 pb-6">
                <Link href="/" className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/sumusd_logo.svg" alt="SumUSD" width={40} height={40} className="h-10 w-10" />
                    <div>
                        <h1 className="text-xl font-semibold tracking-tight">SumUSD</h1>
                        <p className="text-sm text-black/55">Integrations</p>
                    </div>
                </Link>
                <Link
                    href="/"
                    className="text-sm font-medium text-emerald-700 transition-colors hover:text-emerald-600"
                >
                    Open app →
                </Link>
            </header>

            <p className="max-w-prose text-sm leading-relaxed text-black/60">
                Everything needed to integrate SumUSD: the deployed contract addresses, brand assets, and the exact
                on-chain calls to mint, redeem, and batch-redeem. SumUSD is a standard ERC-20 (18 decimals); the{" "}
                <Mono>SumUSDEngine</Mono> is the entrypoint for every mint and redeem. All amounts are in base units
                and every flavor is valued at par ($1 = 1 unit).
            </p>

            {/* --- Contracts --- */}
            <section className="flex flex-col gap-4">
                <SectionHeading n="01" title="Contracts" />
                <p className="text-sm leading-relaxed text-black/60">
                    Addresses are published per network on deployment and injected into the frontend via the env
                    vars below. Networks:{" "}
                    <span className="text-black/75">{NETWORKS.join(" · ")}</span>.
                </p>

                <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                        <thead>
                            <tr className="border-b border-black/10 text-left text-xs uppercase tracking-wider text-black/45">
                                <th className="py-2 pr-4 font-medium">Contract</th>
                                <th className="py-2 pr-4 font-medium">Role</th>
                                <th className="py-2 pr-4 font-medium">Address</th>
                                <th className="py-2 font-medium">Env var</th>
                            </tr>
                        </thead>
                        <tbody>
                            {CONTRACTS.map((c) => (
                                <tr key={c.name} className="border-b border-black/[0.06]">
                                    <td className="py-2.5 pr-4 font-medium text-black">{c.name}</td>
                                    <td className="py-2.5 pr-4 text-black/60">{c.role}</td>
                                    <td className="py-2.5 pr-4">
                                        <Tba />
                                    </td>
                                    <td className="py-2.5">
                                        <Mono>{c.env}</Mono>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <h3 className="mt-2 text-sm font-medium text-black/75">Collateral flavors</h3>
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                        <thead>
                            <tr className="border-b border-black/10 text-left text-xs uppercase tracking-wider text-black/45">
                                <th className="py-2 pr-4 font-medium">Symbol</th>
                                <th className="py-2 pr-4 font-medium">Decimals</th>
                                <th className="py-2 pr-4 font-medium">Address</th>
                                <th className="py-2 font-medium">Env var</th>
                            </tr>
                        </thead>
                        <tbody>
                            {COLLATERALS.map((c, i) => (
                                <tr key={c.symbol} className="border-b border-black/[0.06]">
                                    <td className="py-2.5 pr-4 font-medium text-black">{c.symbol}</td>
                                    <td className="py-2.5 pr-4 tabular-nums text-black/60">{c.decimals}</td>
                                    <td className="py-2.5 pr-4">
                                        <Tba />
                                    </td>
                                    <td className="py-2.5">
                                        <Mono>{FLAVOR_ENV[i] ?? "—"}</Mono>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <p className="text-xs leading-relaxed text-black/45">
                    The accepted-collateral set is a governance-curated whitelist and changes only through a
                    timelocked action; treat these as the reference flavors, not a fixed list.
                </p>
            </section>

            {/* --- Brand assets --- */}
            <section className="flex flex-col gap-4">
                <SectionHeading n="02" title="Brand assets" />
                <div className="flex flex-wrap items-center gap-6">
                    <div className="flex items-center gap-4 rounded-2xl border border-black/10 px-6 py-5">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/sumusd_logo.svg" alt="SumUSD logo" width={56} height={56} className="h-14 w-14" />
                        <div>
                            <p className="text-lg font-semibold tracking-tight">SumUSD</p>
                            <p className="text-sm text-black/55">Sigma mark · emerald</p>
                        </div>
                    </div>
                    <ul className="flex flex-col gap-1.5 text-sm">
                        <li>
                            <a className="text-emerald-700 hover:text-emerald-600" href="/sumusd_logo.svg" download>
                                Logo — SVG ↓
                            </a>
                        </li>
                        <li>
                            <a className="text-emerald-700 hover:text-emerald-600" href="/sumusd_logo.png" download>
                                Logo — PNG ↓
                            </a>
                        </li>
                        <li>
                            <a className="text-emerald-700 hover:text-emerald-600" href="/og.png" download>
                                Social / OG image — PNG ↓
                            </a>
                        </li>
                    </ul>
                </div>
                <div className="flex flex-wrap gap-4">
                    {SWATCHES.map((s) => (
                        <div key={s.name} className="flex items-center gap-2.5">
                            <span className={`h-8 w-8 rounded-lg ${s.css} ring-1 ring-inset ring-black/10`} />
                            <div className="text-xs">
                                <p className="font-medium text-black/75">{s.name}</p>
                                <Mono>{s.hex}</Mono>
                            </div>
                        </div>
                    ))}
                </div>
                <p className="max-w-prose text-xs leading-relaxed text-black/45">
                    The mark is a sigma (&ldquo;sum&rdquo;) in an emerald disc. Keep clear space around it, don&apos;t
                    recolor or add effects, and place it on white or a light background. For a monochrome context, use
                    solid Foreground rather than the gradient.
                </p>
            </section>

            {/* --- Function reference --- */}
            <section className="flex flex-col gap-4">
                <SectionHeading n="03" title="Contract calls" />
                <p className="max-w-prose text-sm leading-relaxed text-black/60">
                    The public entrypoints, with 4-byte selectors. Writes go to the engine except{" "}
                    <Mono>approve</Mono>, which is called on the collateral token. Redemptions need no approval — the
                    engine burns the caller&apos;s SumUSD directly.
                </p>

                <ul className="flex flex-col divide-y divide-black/[0.06] border-y border-black/10">
                    {CALLS.map((call) => (
                        <li key={call.name} className="flex flex-col gap-1.5 py-3.5">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="font-mono text-sm font-medium text-black">{call.name}</span>
                                <Badge tone={call.write ? "write" : "view"}>{call.write ? "write" : "view"}</Badge>
                                <Badge tone="target">{call.target}</Badge>
                                <span className="ml-auto">
                                    <Mono>{call.selector}</Mono>
                                </span>
                            </div>
                            <p className="overflow-x-auto font-mono text-xs leading-relaxed text-black/70">
                                {call.sig}
                            </p>
                            <p className="max-w-prose text-xs leading-relaxed text-black/50">{call.desc}</p>
                        </li>
                    ))}
                </ul>

                <CodeBlock label="ISumUSDEngine.sol — canonical interface">{SOLIDITY}</CodeBlock>
                <CodeBlock label="viem / wagmi — mint, redeem, redeemBatch, redeemMix">{VIEM}</CodeBlock>
                <p className="text-xs leading-relaxed text-black/45">
                    The full engine ABI the app uses lives in{" "}
                    <Mono>lib/contracts.ts</Mono>; the protocol and mechanism are specified in the whitepaper.
                </p>
            </section>

            <footer className="border-t border-black/10 pt-6 text-sm text-black/50">
                <Link href="/" className="font-medium text-emerald-700 hover:text-emerald-600">
                    ← Back to the app
                </Link>
            </footer>
        </main>
    );
}

function SectionHeading({n, title}: {n: string; title: string}) {
    return (
        <div className="flex items-baseline gap-3">
            <span className="font-mono text-xs text-black/35">{n}</span>
            <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        </div>
    );
}

function Mono({children}: {children: string}) {
    return (
        <code className="rounded bg-black/[0.06] px-1.5 py-0.5 font-mono text-[0.8em] text-black/70">{children}</code>
    );
}

function Tba() {
    return (
        <span className="inline-flex items-center rounded bg-amber-500/10 px-1.5 py-0.5 font-mono text-xs text-amber-700">
            0x… TBA
        </span>
    );
}

function Badge({children, tone}: {children: string; tone: "write" | "view" | "target"}) {
    const styles = {
        write: "bg-emerald-500/10 text-emerald-700",
        view: "bg-black/[0.06] text-black/50",
        target: "bg-black/[0.06] text-black/50",
    }[tone];
    return (
        <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[0.7rem] font-medium ${styles}`}>
            {children}
        </span>
    );
}

function CodeBlock({children, label}: {children: string; label?: string}) {
    return (
        <div className="overflow-hidden rounded-xl border border-black/10 bg-black/[0.03]">
            {label && (
                <div className="border-b border-black/10 px-4 py-2 font-mono text-xs text-black/45">{label}</div>
            )}
            <pre className="overflow-x-auto px-4 py-3 text-xs leading-relaxed">
                <code className="font-mono text-black/80">{children}</code>
            </pre>
        </div>
    );
}
