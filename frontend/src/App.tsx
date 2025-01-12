// Supports weights 100-900
//import '@fontsource-variable/outfit';

import {
  createBrowserRouter,
  RouterProvider,
} from "react-router-dom";
import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'

import ErrorPage from "./ErrorPage.jsx";
import ShowPage from "./ShowPage.tsx";
import RecentPage from "./RecentPage.tsx";
import SearchPage from "./SearchPage.tsx";

const router = createBrowserRouter([
  {
    path: "/",
    element: <RecentPage />,
    errorElement: <ErrorPage />,
  },
  {
    path: "/show/:recipeUrl",
    element: <ShowPage />
  },
  {
    path: "/search",
    element: <SearchPage />
  }
]);

const queryClient = new QueryClient()

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}
