import { Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import MetricPage from "./pages/MetricPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/metric/:id" element={<MetricPage />} />
    </Routes>
  );
}
