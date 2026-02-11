import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "./providers/theme";
import { CreateGroupPage } from "@/pages/create-group";
import { JoinGroupPage } from "@/pages/join-group";
import { RoomPage } from "@/pages/room";

export function App() {

  console.log("App!!!");

  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<CreateGroupPage />} />
          <Route path="/join" element={<JoinGroupPage />} />
          <Route path="/room" element={<RoomPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}
