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
import { Provider } from "@/components/ui/provider"

import ErrorPage from "./ErrorPage.jsx";
import ShowPage from "./ShowPage.tsx";
import MainPage from "./MainPage.tsx";
import ShareTarget from "./ShareTarget.tsx";

const router = createBrowserRouter([
  {
    path: "/",
    element: <MainPage />,
    errorElement: <ErrorPage />,
  },
  {
    path: "/recent",
    element: <MainPage />,
    errorElement: <ErrorPage />,
  },
  {
    path: "/favorites",
    element: <MainPage />,
    errorElement: <ErrorPage />,
  },
  {
    path: "/add",
    element: <MainPage />,
    errorElement: <ErrorPage />,
  },
  {
    path: "/search",
    element: <MainPage />,
    errorElement: <ErrorPage />,
  },
  {
    path: "/show/:recipeUrl",
    element: <ShowPage />
  },
  {
    path: "/share-target",
    element: <ShareTarget />
  }
]);

const queryClient = new QueryClient()

export default function App() {
  return (
    <Provider>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </Provider>
  )
}
