import { Routes, Route } from "react-router-dom";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import AreaPage from "./pages/AreaPage";
import Carousel from "./components/Carousel";
import Dashboard from "./components/Dashboard";
import Home from "./pages/Home";
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
        {/* Every area is one slug off the root — /developer, /english, /steps.
            The static "/" above still wins over the parameter. Deeper segments
            narrow an area to one of its sections, then to a page inside it. */}
        <Route path="/:area" element={<AreaPage />} />
        <Route path="/:area/:section" element={<AreaPage />} />
        <Route path="/:area/:section/:pageId" element={<AreaPage />} />
      </Routes>
      <ToastContainer
        position="bottom-right"
        autoClose={3500}
        theme={t.scheme}
      />
    </>
  );
}
