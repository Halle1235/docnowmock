import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Index from "./pages/Index";
import Registration from "./pages/Registration";
import MedicalReason from "./pages/MedicalReason";
import Payment from "./pages/Payment";
import WaitingRoom from "./pages/WaitingRoom";
import Auth from "./pages/Auth";
import DoctorDashboard from "./pages/DoctorDashboard";
import VideoCall from "./pages/VideoCall";
import AdminDashboard from "./pages/AdminDashboard";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";
import MyVisits from "./pages/MyVisits";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/registration" element={<Registration />} />
          <Route path="/medical-reason" element={<MedicalReason />} />
          <Route path="/payment" element={<Payment />} />
          <Route path="/waiting-room" element={<WaitingRoom />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/doctor-dashboard" element={<DoctorDashboard />} />
          <Route path="/call/:consultationId" element={<VideoCall />} />
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin-dashboard" element={<Navigate to="/admin" replace />} />
          <Route path="/my-visits" element={<MyVisits />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
