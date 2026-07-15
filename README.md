# SumUSD dapp

The mint/redeem web app for **[SumUSD](https://github.com/sumusd/sumusd)**, an over-collateralized,
aggregated USD stablecoin. Deposit a whitelisted stablecoin flavor to mint SumUSD, or burn SumUSD to
redeem any flavor the pool holds, and check system health (backing ratio, live redemption rates).
Production site: **[sumusd.com](https://sumusd.com)**.

## Stack

- [Next.js](https://nextjs.org) (App Router) + TypeScript
- [wagmi](https://wagmi.sh) + [RainbowKit](https://www.rainbowkit.com) + [viem](https://viem.sh) for
  wallet connection and contract reads/writes

## Getting started

```bash
npm install
npm run dev        # http://localhost:3000
```

Other scripts: `npm run build` (production build, also runs the TypeScript check) and `npm run lint`.

## Configuration

All contract addresses come from `NEXT_PUBLIC_*` environment variables, so a single build works
across networks. Copy the template and fill it in:

```bash
cp .env.example .env.local
```

- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` — from [WalletConnect Cloud](https://cloud.walletconnect.com)
- `NEXT_PUBLIC_ENGINE_ADDRESS`, `NEXT_PUBLIC_SUMUSD_ADDRESS` — the deployed engine and token

Collateral flavors are **not** configured here. The app discovers the whitelisted set on-chain from
the engine (`listedCollaterals()` + per-token `configs()` / `symbol()`, see `lib/useCollaterals.ts`),
so the UI tracks governance listings/removals automatically with no rebuild.

For local development against an `anvil` chain, additionally set `NEXT_PUBLIC_ENABLE_LOCAL=true` and
paste the addresses printed by the protocol repo's `SetupLocal` script; the read-only views then
resolve without a connected wallet.

## Related

- **[sumusd/sumusd](https://github.com/sumusd/sumusd)** — the protocol (contracts + whitepaper)

## License

Business Source License 1.1 (BUSL-1.1) — see [LICENSE](./LICENSE). Non-commercial use is permitted;
commercial use requires a separate license from the Licensor. The license converts to **MIT** on the
Change Date (2032-07-04). Third-party dependencies keep their own licenses.
