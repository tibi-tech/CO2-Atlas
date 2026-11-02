import "@fontsource-variable/fraunces";
import "@fontsource-variable/instrument-sans";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import "./i18n";
import "./index.css";
import { AuthProvider } from "./components/Auth";
import Layout, { NotFound } from "./components/Layout";
import About from "./pages/About";
import Home from "./pages/Home";
import NewRegion from "./pages/NewRegion";
import RegionPage from "./pages/RegionPage";
import RunPage from "./pages/RunPage";
import Settings from "./pages/Settings";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 10_000, retry: 1, refetchOnWindowFocus: false } },
});

const router = createBrowserRouter([
  {
    element: <Layout />,
    errorElement: <Layout><NotFound /></Layout>,
    children: [
      { path: "/", element: <Home /> },
      { path: "/regions/new", element: <NewRegion /> },
      { path: "/regions/:id", element: <RegionPage /> },
      { path: "/runs/:id", element: <RunPage /> },
      { path: "/about", element: <About /> },
      { path: "/settings", element: <Settings /> },
      { path: "*", element: <NotFound /> },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
