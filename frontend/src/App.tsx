import { Routes, Route } from "react-router-dom";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import Carousel from "./components/Carousel";
import Dashboard from "./components/Dashboard";
import Home from "./pages/Home";
import MetricPage from "./pages/MetricPage";
import Todos from "./pages/Todos";
import { useTheme } from "./theme";

export default function App() {
  // Toasts render outside every page, so they follow the app-wide theme rather
  // than being pinned to one scheme. They only know light from dark, so they
  // take the palette's base rather than its name.
  const { t } = useTheme();

  return (
    <>
      <Routes>
        <Route
          path="/"
          element={
            <Carousel initial={0}>
              <Dashboard />
              <Home />
            </Carousel>
          }
        />
        <Route path="/todos" element={<Todos />} />
        <Route path="/metric/:id" element={<MetricPage />} />
        {/* Same page, narrowed to one Developer subject, then to one of its pages. */}
        <Route path="/metric/:id/:topic" element={<MetricPage />} />
        <Route path="/metric/:id/:topic/:pageId" element={<MetricPage />} />
      </Routes>
      <ToastContainer
        position="bottom-right"
        autoClose={3500}
        theme={t.scheme}
      />
    </>
  );
}
