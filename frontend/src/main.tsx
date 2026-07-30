import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import {
  QueryClient,
  QueryClientProvider,
  QueryCache,
  MutationCache,
} from "@tanstack/react-query";
import { toast } from "react-toastify";
import App from "./App";
import "./index.css";

// Surface every failed query/mutation as a toast, so components don't each need
// their own error handling.
const notifyError = (error: Error) =>
  toast.error(error.message || "Something went wrong");

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: notifyError }),
  mutationCache: new MutationCache({ onError: notifyError }),
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error('index.html is missing its <div id="root">');

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
