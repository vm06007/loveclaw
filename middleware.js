import { next, rewrite } from "@vercel/functions";

/**
 * Runs before static files: bare `/` or `/index.html` without join query → welcome page.
 * Local dev still uses Vite `welcomeRootPlugin`; production uses this on Vercel.
 */
export const config = {
    matcher: ["/", "/index.html"],
};

export default function middleware(request) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (path !== "/" && path !== "/index.html") {
        return next();
    }
    if (url.searchParams.has("pact") || url.searchParams.has("role")) {
        return next();
    }
    return rewrite(new URL("/welcome/index.html", request.url));
}
