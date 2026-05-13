import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError, useLocation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { NavMenu } from "@shopify/app-bridge-react";

import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();
  const { pathname } = useLocation();

  // ui-nav-menu scans children top-to-bottom for the first prefix match.
  // Specific routes must come before /app (Dashboard) so they win for sub-routes
  // like /app/diagrams/new before /app does.  We also key on section so the web
  // component re-mounts and re-reads window.location when crossing sections.
  const navSection = pathname.startsWith("/app/diagrams")
    ? "diagrams"
    : pathname.startsWith("/app/categories")
      ? "categories"
      : pathname.startsWith("/app/additional")
        ? "additional"
        : "dashboard";

  return (
    <AppProvider embedded apiKey={apiKey}>
      <NavMenu key={navSection}>
        {/* Specific routes first so /app/diagrams matches before /app does */}
        <a href="/app/diagrams">Diagrams</a>
        <a href="/app/categories">Categories</a>
        <a href="/app/additional">Getting started</a>
        <a href="/app">Dashboard</a>
      </NavMenu>
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
