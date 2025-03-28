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

const router = createBrowserRouter([
  {
    path: "/",
    element: <MainPage />,
    errorElement: <ErrorPage />,
  },
  {
    path: "/show/:recipeUrl",
    element: <ShowPage />
  },
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
