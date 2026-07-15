import type {NextConfig} from "next";

// Static export: `next build` emits a fully static site to `out/` (no Node server), served as-is by
// GitHub Pages at the custom domain sumusd.com. The app is client-only (wagmi reads run in the browser),
// so nothing dynamic is lost. All NEXT_PUBLIC_* values are inlined at build time.
const nextConfig: NextConfig = {
    output: "export",
    images: {unoptimized: true}, // no Next image-optimization server on static hosting
};

export default nextConfig;
