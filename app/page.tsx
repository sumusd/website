"use client";

import {ConnectButton} from "@rainbow-me/rainbowkit";
import Link from "next/link";
import {useEffect, useMemo, useState} from "react";
import {formatUnits, parseUnits} from "viem";
import {
    useAccount,
    useReadContract,
    useReadContracts,
    useWaitForTransactionReceipt,
    useWriteContract,
} from "wagmi";
import {ENGINE_ABI, ENGINE_ADDRESS, ERC20_ABI} from "@/lib/contracts";
import {useCollaterals} from "@/lib/useCollaterals";

type Mode = "mint" | "redeem";

// Mirrors MIN_MINT_RATIO_BPS in SumUSDEngine: minting is paused below 99% system backing.
const MIN_MINT_RATIO_BPS = 9_900n;
// Mirrors DISTRESS_RATIO_BPS: below this, single-flavor redeem is disabled in favor of pro-rata redeemMix.
const DISTRESS_RATIO_BPS = 9_900n;

// A green ramp for the basket-composition bar/legend (data viz, not decoration), one entry per flavor.
const SEGMENT = ["bg-emerald-600", "bg-emerald-400", "bg-emerald-300", "bg-emerald-700", "bg-emerald-200"];

const FAQS: {q: string; a: string}[] = [
    {
        q: "What is SumUSD?",
        a: "SumUSD is an aggregated US-dollar stablecoin. It is backed by a diversified basket of credible, major USD stablecoins (prioritizing GENIUS-Act-compliant, US-Treasury-backed issuers), and packages them into a single, fungible dollar token you can mint and redeem on-chain.",
    },
    {
        q: "How do I mint SumUSD?",
        a: "Deposit any whitelisted collateral and receive SumUSD as a raw 1:1 unit swap (normalized for decimals). One unit of any accepted flavor mints exactly one SumUSD; every accepted stablecoin is treated as a fungible dollar.",
    },
    {
        q: "How do redemptions work, and why does the rate vary by asset?",
        a: "Burn SumUSD to receive any flavor the pool holds, as a fungible 1:1 unit swap minus a per-collateral haircut (every flavor is treated as exactly $1). Moderate imbalances are tolerated at the base rate; only when a flavor drifts well off its target weight does the haircut tilt: an over-represented flavor becomes cheaper to redeem (rewarding rebalancing), while a scarce one gets progressively more expensive the closer it is to running out. The basket stays balanced and every flavor is always redeemable. The live rate is quoted before you confirm. You can also split one redemption across several flavors in a single transaction with “Split across flavors”, which is the cheaper way to exit a large amount without paying the scarcity premium on any one flavor.",
    },
    {
        q: "Is SumUSD over-collateralized?",
        a: "Yes. The redemption haircut leaves residual value in the pool on every exit, so mark-to-market backing trends above 100% over time. The current system collateralization is shown at the top of this page.",
    },
    {
        q: "What collateral is accepted?",
        a: "A governance-curated whitelist, never permissionless. It prioritizes GENIUS-Act-compliant, US-Treasury-backed payment stablecoins as the core of the basket; other credible designs may be admitted under more conservative risk parameters. The convex redemption haircut keeps the basket balanced by making it progressively more expensive to drain any one flavor.",
    },
    {
        q: "What must a stablecoin meet to be listed?",
        a: "Beyond the credibility bar above, a candidate must be technically well-behaved, because the protocol accounts for collateral by its on-chain balance and treats one unit as one dollar. Required properties: standard fixed decimals; non-rebasing, so a balance changes only on transfer and never on its own; no transfer hooks or callbacks; freely transferable with no fee-on-transfer (or a negligible, disclosed one); and honest, immutable metadata. Rebasing, fee-on-transfer, and hook-bearing tokens are excluded, since any of them would silently break the 1:1 unit accounting or redemption. Every listing is a timelocked governance action, so this vetting happens before any deposit of that asset is possible.",
    },
    {
        q: "What happens during a de-peg?",
        a: "If system backing falls below 99% (for example during a collateral de-peg), new minting pauses automatically so no one can mint into an under-backed pool. It resumes on its own once backing recovers. Redemptions always stay open so holders can exit.",
    },
    {
        q: "What are the risks?",
        a: "SumUSD inherits the issuer and de-peg risk of its underlying stablecoins, plus smart-contract and price-oracle risk. It is not a yield product; it is a diversified, redeemable dollar. Review the contracts and whitepaper before depositing.",
    },
];

export default function Home() {
    const {address, isConnected} = useAccount();
    // The collateral basket, discovered on-chain (governance-curated, no hardcoded flavor list).
    const {collaterals} = useCollaterals();
    const [mode, setMode] = useState<Mode>("mint");
    const [collateralIdx, setCollateralIdx] = useState(0);
    const [collateralPicked, setCollateralPicked] = useState(false);
    const [amount, setAmount] = useState("");
    // Batch redeem: split a burn across several flavors in one tx (normal mode only). One sumUSD amount
    // per flavor keyed by address; empty/zero legs are dropped before previewing or submitting.
    const [batch, setBatch] = useState(false);
    const [batchAmounts, setBatchAmounts] = useState<Record<string, string>>({});

    // Selected flavor for single mint/redeem; falls back to the first if the index is out of range
    // (e.g. before the list loads or after the basket changes). Undefined only when the basket is empty.
    const collateral = collaterals[collateralIdx] ?? collaterals[0];
    // On mint, the input is denominated in the collateral; on redeem, in SumUSD (18 decimals).
    const inputDecimals = mode === "mint" ? (collateral?.decimals ?? 18) : 18;

    const parsedAmount = useMemo(() => {
        try {
            return amount ? parseUnits(amount, inputDecimals) : 0n;
        } catch {
            return 0n;
        }
    }, [amount, inputDecimals]);

    const {data: ratioBps} = useReadContract({
        address: ENGINE_ADDRESS,
        abi: ENGINE_ABI,
        functionName: "systemCollateralizationRatioBps",
        query: {refetchInterval: 15_000},
    });

    // Distressed: backing below the distress line (but not the bootstrap "infinite" sentinel).
    // In this regime single-flavor redeem is gated and holders exit pro-rata via redeemMix.
    const distressed = ratioBps !== undefined && ratioBps <= 1_000_000n && ratioBps < DISTRESS_RATIO_BPS;
    const redeemMixMode = mode === "redeem" && distressed;
    // Batch redeem is a normal-mode convenience only: below the distress line the engine forces redeemMix.
    const batchMode = mode === "redeem" && !distressed && batch;

    // The non-zero legs of the batch editor: {flavor, sumUSD amount}. Both preview and submit use this,
    // so a zero-amount leg (which redeemBatch would revert on) is never sent.
    const batchLegs = useMemo(
        () =>
            collaterals
                .map((c) => {
                    let amt = 0n;
                    try {
                        amt = batchAmounts[c.address] ? parseUnits(batchAmounts[c.address], 18) : 0n;
                    } catch {
                        amt = 0n;
                    }
                    return {collateral: c, amount: amt};
                })
                .filter((l) => l.amount > 0n),
        [collaterals, batchAmounts],
    );
    const batchTotal = batchLegs.reduce((sum, l) => sum + l.amount, 0n);

    // The flavor the pool most needs — used to nudge deposits toward balance.
    const {data: needed} = useReadContract({
        address: ENGINE_ADDRESS,
        abi: ENGINE_ABI,
        functionName: "poolNeeds",
        query: {refetchInterval: 15_000},
    });
    const neededIdx = needed
        ? collaterals.findIndex((c) => c.address.toLowerCase() === (needed as string).toLowerCase())
        : -1;

    // Default the deposit selector to the most-needed flavor until the user picks one themselves.
    useEffect(() => {
        if (mode === "mint" && !collateralPicked && neededIdx >= 0 && neededIdx !== collateralIdx) {
            setCollateralIdx(neededIdx);
        }
    }, [mode, collateralPicked, neededIdx, collateralIdx]);

    const {data: tvl} = useReadContract({
        address: ENGINE_ADDRESS,
        abi: ENGINE_ABI,
        functionName: "totalCollateralValueUsd",
        query: {refetchInterval: 15_000},
    });

    // Per-flavor USD value, for the basket-composition bar.
    const {data: flavorValues} = useReadContracts({
        contracts: collaterals.map((c) => ({
            address: ENGINE_ADDRESS,
            abi: ENGINE_ABI,
            functionName: "collateralValueUsd",
            args: [c.address],
        })),
        query: {enabled: collaterals.length > 0, refetchInterval: 15_000},
    });
    const composition = collaterals.map((c, i) => ({
        collateral: c,
        value: (flavorValues?.[i]?.result as bigint | undefined) ?? 0n,
        color: SEGMENT[i % SEGMENT.length],
    }));
    const compositionTotal = composition.reduce((sum, x) => sum + x.value, 0n);
    const sharePct = (value: bigint) =>
        compositionTotal > 0n ? Number((value * 10_000n) / compositionTotal) / 100 : 0;

    // Per-flavor price-feed health: [livePriceWad(price, ok), lastGoodPriceAt, valuationPriceWad] × N.
    const {data: feedReads} = useReadContracts({
        contracts: collaterals.flatMap((c) => [
            {address: ENGINE_ADDRESS, abi: ENGINE_ABI, functionName: "livePriceWad", args: [c.address]},
            {address: ENGINE_ADDRESS, abi: ENGINE_ABI, functionName: "lastGoodPriceAt", args: [c.address]},
            {address: ENGINE_ADDRESS, abi: ENGINE_ABI, functionName: "valuationPriceWad", args: [c.address]},
        ]),
        query: {enabled: collaterals.length > 0, refetchInterval: 15_000},
    });
    const nowSecs = Math.floor(Date.now() / 1000);
    const feeds = collaterals.map((c, i) => {
        const live = feedReads?.[i * 3]?.result as readonly [bigint, boolean] | undefined;
        return {
            collateral: c,
            livePrice: live?.[0] ?? 0n,
            liveOk: live?.[1] ?? false,
            lastAt: (feedReads?.[i * 3 + 1]?.result as bigint | undefined) ?? 0n,
            valuation: (feedReads?.[i * 3 + 2]?.result as bigint | undefined) ?? 0n,
        };
    });

    const {data: preview} = useReadContract({
        address: ENGINE_ADDRESS,
        abi: ENGINE_ABI,
        functionName: mode === "mint" ? "previewDeposit" : "previewRedeem",
        args: [collateral?.address, parsedAmount],
        query: {enabled: !!collateral && parsedAmount > 0n && !redeemMixMode && !batchMode},
    });

    // Net per leg for the batch editor, priced on one snapshot exactly as redeemBatch pays out.
    const {data: batchPreview} = useReadContract({
        address: ENGINE_ADDRESS,
        abi: ENGINE_ABI,
        functionName: "previewRedeemBatch",
        args: [batchLegs.map((l) => l.collateral.address), batchLegs.map((l) => l.amount)],
        query: {enabled: batchMode && batchLegs.length > 0},
    });

    // Pro-rata breakdown when distressed: [tokens[], amounts[]].
    const {data: mixPreview} = useReadContract({
        address: ENGINE_ADDRESS,
        abi: ENGINE_ABI,
        functionName: "previewRedeemMix",
        args: [parsedAmount],
        query: {enabled: redeemMixMode && parsedAmount > 0n},
    });

    const {data: currentRedeemRate} = useReadContract({
        address: ENGINE_ADDRESS,
        abi: ENGINE_ABI,
        functionName: "currentRedeemRateBps",
        args: [collateral?.address],
        query: {enabled: !!collateral && mode === "redeem" && !distressed && !batchMode, refetchInterval: 15_000},
    });

    const {data: allowance} = useReadContract({
        address: collateral?.address,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: address ? [address, ENGINE_ADDRESS] : undefined,
        query: {enabled: mode === "mint" && !!address && !!collateral},
    });

    const {writeContract, data: txHash, isPending} = useWriteContract();
    const {isLoading: isConfirming} = useWaitForTransactionReceipt({hash: txHash});

    const needsApproval =
        mode === "mint" && !!collateral && parsedAmount > 0n && (allowance ?? 0n) < parsedAmount;
    const outputDecimals = mode === "mint" ? 18 : (collateral?.decimals ?? 18);
    const outputSymbol = mode === "mint" ? "sumUSD" : (collateral?.symbol ?? "");

    function handleApprove() {
        if (!collateral) return;
        writeContract({
            address: collateral.address,
            abi: ERC20_ABI,
            functionName: "approve",
            args: [ENGINE_ADDRESS, parsedAmount],
        });
    }

    function handleSubmit() {
        if (mode === "mint") {
            if (!collateral) return;
            writeContract({
                address: ENGINE_ADDRESS,
                abi: ENGINE_ABI,
                functionName: "deposit",
                args: [collateral.address, parsedAmount, 0n],
            });
        } else if (redeemMixMode) {
            // Pro-rata exit: empty minOut array skips per-token slippage checks.
            writeContract({
                address: ENGINE_ADDRESS,
                abi: ENGINE_ABI,
                functionName: "redeemMix",
                args: [parsedAmount, []],
            });
        } else if (batchMode) {
            // Multi-flavor redeem in one tx; zero minOuts skip per-leg slippage checks.
            writeContract({
                address: ENGINE_ADDRESS,
                abi: ENGINE_ABI,
                functionName: "redeemBatch",
                args: [
                    batchLegs.map((l) => l.collateral.address),
                    batchLegs.map((l) => l.amount),
                    batchLegs.map(() => 0n),
                ],
            });
        } else {
            if (!collateral) return;
            writeContract({
                address: ENGINE_ADDRESS,
                abi: ENGINE_ABI,
                functionName: "redeem",
                args: [collateral.address, parsedAmount, 0n],
            });
        }
    }

    const busy = isPending || isConfirming;

    // Engine returns ~uint256 max when supply is 0 (bootstrap) — treat as "infinitely backed".
    const ratioInfinite = ratioBps !== undefined && ratioBps > 1_000_000n;
    const underMinMint = ratioBps !== undefined && ratioBps < MIN_MINT_RATIO_BPS;
    const mintPaused = mode === "mint" && underMinMint;
    const ratioDisplay =
        ratioBps === undefined ? "—" : ratioInfinite ? "∞" : `${(Number(ratioBps) / 100).toFixed(2)}%`;

    const systemState: {label: string; tone: "ok" | "bad" | "neutral"} =
        ratioBps === undefined
            ? {label: "Loading", tone: "neutral"}
            : ratioInfinite
              ? {label: "Awaiting first deposit", tone: "neutral"}
              : ratioBps < DISTRESS_RATIO_BPS
                ? {label: "Under-collateralized", tone: "bad"}
                : {label: "Fully backed", tone: "ok"};
    const dotTone = {
        ok: "bg-emerald-500",
        bad: "bg-red-500",
        neutral: "bg-black/30",
    }[systemState.tone];
    const labelTone = {
        ok: "text-emerald-700",
        bad: "text-red-600",
        neutral: "text-black/50",
    }[systemState.tone];

    return (
        <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-12 px-6 py-12 sm:gap-16 sm:py-16">
            <header className="flex items-center justify-between gap-4 border-b border-black/10 pb-6">
                <div className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/sumusd_logo.svg" alt="SumUSD" width={40} height={40} className="h-10 w-10" />
                    <div>
                        <h1 className="text-xl font-semibold tracking-tight">SumUSD</h1>
                        <p className="text-sm text-black/55">Aggregated USD stablecoin</p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <Link
                        href="/integrations"
                        className="hidden text-sm font-medium text-black/55 transition-colors hover:text-black/80 sm:inline"
                    >
                        Integrations
                    </Link>
                    <ConnectButton showBalance={false} chainStatus="icon" />
                </div>
            </header>

            <div className="grid items-start gap-10 md:grid-cols-12 md:gap-12">
                {/* System status — an editorial readout, not boxed stat cards. */}
                <section className="md:col-span-7">
                    <p className="text-xs font-medium uppercase tracking-wider text-black/45">Collateralization</p>
                    <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
                        <span className="text-5xl font-semibold tracking-tight tabular-nums">{ratioDisplay}</span>
                        <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${labelTone}`}>
                            <span className={`h-2 w-2 rounded-full ${dotTone}`} aria-hidden />
                            {systemState.label}
                        </span>
                    </div>

                    <div className="mt-8">
                        <div className="flex items-baseline justify-between text-xs">
                            <span className="font-medium uppercase tracking-wider text-black/45">
                                Basket composition
                            </span>
                            <span className="tabular-nums text-black/55">
                                {tvl !== undefined
                                    ? `$${Number(formatUnits(tvl, 18)).toLocaleString()} backing`
                                    : "—"}
                            </span>
                        </div>
                        <div className="mt-2 flex h-2.5 w-full overflow-hidden rounded-full bg-black/[0.06]">
                            {compositionTotal > 0n &&
                                composition.map(({collateral: c, value, color}) => {
                                    const pct = sharePct(value);
                                    if (pct <= 0) return null;
                                    return (
                                        <div
                                            key={c.address}
                                            className={color}
                                            style={{width: `${pct}%`}}
                                            title={`${c.symbol}: ${pct.toFixed(1)}%`}
                                        />
                                    );
                                })}
                        </div>
                        <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-xs">
                            {composition.map(({collateral: c, value, color}) => (
                                <li key={c.address} className="flex items-center gap-1.5">
                                    <span className={`h-2 w-2 rounded-full ${color}`} aria-hidden />
                                    <span className="text-black/70">{c.symbol}</span>
                                    <span className="tabular-nums text-black/45">
                                        {compositionTotal > 0n ? `${sharePct(value).toFixed(1)}%` : "—"}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Price feeds — the latest oracle read per flavor, with feed health. */}
                    <div className="mt-8">
                        <p className="text-xs font-medium uppercase tracking-wider text-black/45">Price feeds</p>
                        <ul className="mt-2 divide-y divide-black/[0.06] text-sm">
                            {feeds.map(({collateral: c, livePrice, liveOk, lastAt, valuation}) => {
                                const status = liveOk
                                    ? {price: livePrice, label: "live", dot: "bg-emerald-500", tone: "text-black/45"}
                                    : valuation > 0n
                                      ? {
                                            price: valuation,
                                            label: `stale · last good ${feedAge(nowSecs, lastAt)}`,
                                            dot: "bg-amber-500",
                                            tone: "text-amber-700",
                                        }
                                      : {price: 0n, label: "no price", dot: "bg-red-500", tone: "text-red-600"};
                                return (
                                    <li key={c.address} className="flex items-center justify-between gap-3 py-1.5">
                                        <span className="flex items-center gap-1.5">
                                            <span className={`h-2 w-2 rounded-full ${status.dot}`} aria-hidden />
                                            <span className="text-black/70">{c.symbol}</span>
                                        </span>
                                        <span className="flex items-baseline gap-2 tabular-nums">
                                            <span className="font-medium text-black">
                                                {status.price > 0n ? `$${formatPrice(status.price)}` : "—"}
                                            </span>
                                            <span className={`text-xs ${status.tone}`}>{status.label}</span>
                                        </span>
                                    </li>
                                );
                            })}
                        </ul>
                        <p className="mt-2 text-xs leading-relaxed text-black/45">
                            The latest oracle read backing each flavor. A down feed falls back to its last good
                            price (haircut) for a short window, so a brief outage doesn&apos;t disrupt the system.
                        </p>
                    </div>

                    <p className="mt-8 max-w-prose text-sm leading-relaxed text-black/60">
                        Deposit any accepted dollar to mint SumUSD at 1:1. Redeem for any flavor the pool holds;
                        redemptions leave a small haircut behind (steeper for scarce flavors), so backing trends
                        above 100% over time.
                    </p>
                </section>

                {/* The tool — the one element that earns a container. */}
                <section className="rounded-2xl border border-black/10 p-6 md:col-span-5">
                    <div className="mb-4 grid grid-cols-2 rounded-lg bg-black/5 p-1 text-sm font-medium">
                        {(["mint", "redeem"] as Mode[]).map((m) => (
                            <button
                                key={m}
                                type="button"
                                aria-pressed={mode === m}
                                onClick={() => setMode(m)}
                                className={`rounded-md py-1.5 capitalize transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 ${
                                    mode === m
                                        ? "bg-white shadow-sm"
                                        : "text-black/50 hover:text-black/70"
                                }`}
                            >
                                {m}
                            </button>
                        ))}
                    </div>

                    {collaterals.length === 0 && (
                        <p className="mb-3 text-xs text-black/45">Loading flavors from the engine…</p>
                    )}

                    {mode === "redeem" && !distressed && collaterals.length > 0 && (
                        <div className="mb-3 flex justify-end">
                            <button
                                type="button"
                                onClick={() => setBatch((b) => !b)}
                                className="text-xs font-medium text-emerald-700 transition-colors hover:text-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
                            >
                                {batch ? "← Single flavor" : "Split across flavors →"}
                            </button>
                        </div>
                    )}

                    {batchMode ? (
                        <div className="space-y-2">
                            <p className="mb-1 text-xs text-black/50">Burn sumUSD for each flavor</p>
                            {collaterals.map((c) => (
                                <div key={c.address} className="flex items-center gap-2">
                                    <span className="w-16 shrink-0 text-sm text-black/70">{c.symbol}</span>
                                    <input
                                        inputMode="decimal"
                                        placeholder="0.0"
                                        aria-label={`sumUSD to redeem for ${c.symbol}`}
                                        value={batchAmounts[c.address] ?? ""}
                                        onChange={(e) =>
                                            setBatchAmounts((prev) => ({...prev, [c.address]: e.target.value}))
                                        }
                                        className="min-w-0 flex-1 rounded-lg border border-black/10 bg-transparent px-3 py-2 text-lg tabular-nums outline-none transition-colors duration-150 ease-out focus:border-emerald-500/70"
                                    />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <>
                            <label htmlFor="amount" className="mb-1 block text-xs text-black/50">
                                {mode === "mint"
                                    ? "Deposit collateral"
                                    : redeemMixMode
                                      ? "Burn sumUSD (pro-rata)"
                                      : "Burn sumUSD for"}
                            </label>
                            <div className="flex gap-2">
                                <input
                                    id="amount"
                                    inputMode="decimal"
                                    placeholder="0.0"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    className="min-w-0 flex-1 rounded-lg border border-black/10 bg-transparent px-3 py-2 text-lg tabular-nums outline-none transition-colors duration-150 ease-out focus:border-emerald-500/70"
                                />
                                <select
                                    value={collateralIdx}
                                    disabled={redeemMixMode}
                                    aria-label={mode === "mint" ? "Collateral to deposit" : "Flavor to redeem"}
                                    onChange={(e) => {
                                        setCollateralPicked(true);
                                        setCollateralIdx(Number(e.target.value));
                                    }}
                                    className="rounded-lg border border-black/10 bg-transparent px-3 py-2 outline-none transition-colors duration-150 ease-out focus:border-emerald-500/70 disabled:opacity-40"
                                >
                                    {collaterals.map((c, i) => (
                                        <option key={c.address} value={i}>
                                            {c.symbol}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </>
                    )}

                    {mode === "mint" && neededIdx >= 0 && (
                        <p className="mt-2 text-xs text-emerald-700">
                            {neededIdx === collateralIdx
                                ? `The pool needs ${collaterals[neededIdx]?.symbol} most. Thanks for helping balance it.`
                                : `The pool needs ${collaterals[neededIdx]?.symbol} most; deposit it to help balance the basket.`}
                        </p>
                    )}

                    {redeemMixMode ? (
                        <div className="mt-3 text-sm text-black/60">
                            <span>You receive a pro-rata slice of the basket:</span>
                            <ul className="mt-1 space-y-0.5">
                                {parsedAmount > 0n && mixPreview ? (
                                    (mixPreview[0] as readonly string[])
                                        .map((tok, i) => {
                                            const amt = (mixPreview[1] as readonly bigint[])[i];
                                            const c = collaterals.find(
                                                (x) => x.address.toLowerCase() === tok.toLowerCase(),
                                            );
                                            if (!c || amt === 0n) return null;
                                            return (
                                                <li key={tok} className="font-medium tabular-nums text-black">
                                                    {Number(formatUnits(amt, c.decimals)).toLocaleString()} {c.symbol}
                                                </li>
                                            );
                                        })
                                        .filter(Boolean)
                                ) : (
                                    <li className="text-black/40">—</li>
                                )}
                            </ul>
                        </div>
                    ) : batchMode ? (
                        <div className="mt-3 text-sm text-black/60">
                            <div className="flex items-baseline justify-between">
                                <span>You receive</span>
                                <span className="text-xs tabular-nums text-black/45">
                                    {batchTotal > 0n
                                        ? `Burn ${Number(formatUnits(batchTotal, 18)).toLocaleString()} sumUSD`
                                        : ""}
                                </span>
                            </div>
                            <ul className="mt-1 space-y-0.5">
                                {batchLegs.length > 0 && batchPreview ? (
                                    batchLegs.map((l, i) => (
                                        <li
                                            key={l.collateral.symbol}
                                            className="font-medium tabular-nums text-black"
                                        >
                                            {Number(
                                                formatUnits(
                                                    (batchPreview as readonly bigint[])[i] ?? 0n,
                                                    l.collateral.decimals,
                                                ),
                                            ).toLocaleString()}{" "}
                                            {l.collateral.symbol}
                                        </li>
                                    ))
                                ) : (
                                    <li className="text-black/40">—</li>
                                )}
                            </ul>
                        </div>
                    ) : (
                        <p className="mt-3 text-sm text-black/60">
                            You receive:{" "}
                            <span className="font-medium tabular-nums text-black">
                                {preview !== undefined
                                    ? Number(formatUnits(preview, outputDecimals)).toLocaleString()
                                    : "—"}{" "}
                                {outputSymbol}
                            </span>
                        </p>
                    )}

                    {mode === "redeem" && !distressed && !batchMode && (
                        <p className="mt-1 flex items-center justify-between text-xs text-black/50">
                            <span>Current redemption rate</span>
                            <span className="font-medium tabular-nums text-black">
                                {currentRedeemRate !== undefined
                                    ? `${(Number(currentRedeemRate) / 100).toFixed(2)}%`
                                    : "—"}
                                {currentRedeemRate !== undefined && currentRedeemRate < 10_000n ? (
                                    <span className="ml-1 text-black/40">
                                        ({(100 - Number(currentRedeemRate) / 100).toFixed(2)}% haircut)
                                    </span>
                                ) : null}
                            </span>
                        </p>
                    )}

                    {redeemMixMode && (
                        <p className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-700">
                            System backing is {ratioDisplay} (under-collateralized). Redemptions are pro-rata: you
                            receive a proportional slice of every collateral, so all holders share the shortfall
                            equally regardless of who redeems first.
                        </p>
                    )}

                    {mintPaused && (
                        <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs leading-relaxed text-red-700">
                            Minting is paused: system backing is below 99%. Deposits resume automatically once
                            backing recovers. Redemptions remain open.
                        </p>
                    )}

                    <div className="mt-5">
                        {mintPaused ? (
                            <Button onClick={() => {}} disabled>
                                Minting paused
                            </Button>
                        ) : !isConnected ? (
                            <p className="text-center text-sm text-black/50">Connect a wallet to continue</p>
                        ) : needsApproval ? (
                            <Button onClick={handleApprove} disabled={busy}>
                                {busy ? "Approving…" : `Approve ${collateral?.symbol ?? ""}`}
                            </Button>
                        ) : (
                            <Button
                                onClick={handleSubmit}
                                disabled={busy || (batchMode ? batchTotal === 0n : parsedAmount === 0n)}
                            >
                                {busy
                                    ? "Confirming…"
                                    : mode === "mint"
                                      ? "Mint sumUSD"
                                      : redeemMixMode
                                        ? "Redeem (pro-rata)"
                                        : batchMode
                                          ? "Redeem batch"
                                          : "Redeem"}
                            </Button>
                        )}
                    </div>
                </section>
            </div>

            <section className="border-t border-black/10 pt-10">
                <h2 className="text-lg font-semibold tracking-tight">Common questions</h2>
                <div className="mt-2 grid gap-x-12 sm:grid-cols-2">
                    {FAQS.map((item) => (
                        <details
                            key={item.q}
                            className="group border-b border-black/10 py-4 last:border-b-0 sm:[&:nth-last-child(2)]:border-b-0"
                        >
                            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium transition-colors hover:text-black/70 [&::-webkit-details-marker]:hidden">
                                {item.q}
                                <span className="shrink-0 text-xl leading-none text-black/40 transition-transform duration-200 group-open:rotate-45">
                                    +
                                </span>
                            </summary>
                            <p className="mt-3 max-w-prose text-sm leading-relaxed text-black/60">{item.a}</p>
                        </details>
                    ))}
                </div>
            </section>
        </main>
    );
}

function formatPrice(wad: bigint): string {
    return Number(formatUnits(wad, 18)).toFixed(4);
}

function feedAge(nowSecs: number, at: bigint): string {
    if (at === 0n) return "never";
    const secs = Math.max(0, nowSecs - Number(at));
    if (secs < 60) return `${secs}s ago`;
    if (secs < 3_600) return `${Math.floor(secs / 60)}m ago`;
    if (secs < 86_400) return `${Math.floor(secs / 3_600)}h ago`;
    return `${Math.floor(secs / 86_400)}d ago`;
}

function Button({children, onClick, disabled}: {children: React.ReactNode; onClick: () => void; disabled?: boolean}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className="w-full rounded-lg bg-black py-2.5 font-medium text-white transition-[opacity,transform] duration-150 ease-out hover:opacity-90 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-40 motion-reduce:transition-none motion-reduce:active:scale-100"
        >
            {children}
        </button>
    );
}
