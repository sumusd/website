import type {Address} from "viem";
import {useReadContract, useReadContracts} from "wagmi";
import {type Collateral, ENGINE_ABI, ENGINE_ADDRESS, ERC20_ABI} from "@/lib/contracts";

/// Discover the collateral basket on-chain instead of hardcoding it. `listedCollaterals()` returns the
/// full set of addresses; then one multicall pulls each token's `configs()` (cached decimals + enabled /
/// backingExcluded status) and `symbol()`. The basket is governance-curated and changes without a
/// rebuild, so the UI always reflects the live set. A token whose `symbol()` reverts falls back to a
/// shortened address; a missing config falls back to conservative defaults.
export function useCollaterals(): {collaterals: Collateral[]; isLoading: boolean} {
    const {data: tokens, isLoading: listLoading} = useReadContract({
        address: ENGINE_ADDRESS,
        abi: ENGINE_ABI,
        functionName: "listedCollaterals",
        query: {refetchInterval: 30_000},
    });

    const addresses = (tokens as readonly Address[] | undefined) ?? [];

    const {data: meta, isLoading: metaLoading} = useReadContracts({
        contracts: addresses.flatMap((addr) => [
            {address: ENGINE_ADDRESS, abi: ENGINE_ABI, functionName: "configs", args: [addr]} as const,
            {address: addr, abi: ERC20_ABI, functionName: "symbol"} as const,
        ]),
        query: {enabled: addresses.length > 0, refetchInterval: 30_000},
    });

    const collaterals: Collateral[] = addresses.map((addr, i) => {
        // configs() returns (enabled, decimals, redeemRateBps, oracle, backingExcluded).
        const cfg = meta?.[i * 2]?.result as readonly [boolean, number, number, Address, boolean] | undefined;
        const symbol = (meta?.[i * 2 + 1]?.result as string | undefined) ?? shortAddr(addr);
        return {
            address: addr,
            symbol,
            decimals: cfg ? Number(cfg[1]) : 18,
            enabled: cfg ? cfg[0] : false,
            backingExcluded: cfg ? cfg[4] : false,
        };
    });

    return {collaterals, isLoading: listLoading || (addresses.length > 0 && metaLoading)};
}

function shortAddr(a: string): string {
    return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
