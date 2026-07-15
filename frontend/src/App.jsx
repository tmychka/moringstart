import { Routes, Route } from "react-router-dom";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import Home from "./pages/Home";
import MetricPage from "./pages/MetricPage";

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/metric/:id" element={<MetricPage />} />
      </Routes>
      <ToastContainer position="bottom-right" autoClose={3500} theme="dark" />
    </>
  );
}
