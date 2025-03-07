import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import EditorPage from "./pages/EditorPage";
import { Toaster } from "react-hot-toast";

function App() {
  return (
    <BrowserRouter>
      {/* Toaster for Notifications */}
      <Toaster
        position="top-right"
        reverseOrder={false}
        toastOptions={{
          duration: 4000,
          style: {
            background: "#333",
            color: "#fff",
            borderRadius: "8px",
            padding: "12px",
          },
        }}
      />

      {/* App Routes */}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/editor/:roomId/:userName" element={<EditorPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
