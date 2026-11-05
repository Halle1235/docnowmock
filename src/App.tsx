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
import { AccountProvider, RequireAccount } from "./components/AccountProvider";
import DoctorRegistration from "./pages/DoctorRegistration";
import { BookingDraftProvider } from "./components/BookingDraftProvider";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AccountProvider>
        <BookingDraftProvider>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/registration" element={<Registration />} />
          <Route path="/medical-reason" element={<RequireAccount role="patient"><MedicalReason /></RequireAccount>} />
          <Route path="/payment" element={<RequireAccount role="patient"><Payment /></RequireAccount>} />
          <Route path="/waiting-room" element={<RequireAccount role="patient"><WaitingRoom /></RequireAccount>} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/doctor/login" element={<Navigate to="/auth?as=doctor" replace />} />
          <Route path="/doctor/register" element={<DoctorRegistration />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/doctor-dashboard" element={<RequireAccount role="doctor"><DoctorDashboard /></RequireAccount>} />
          <Route path="/call/:consultationId" element={<RequireAccount><VideoCall /></RequireAccount>} />
          <Route path="/admin" element={<RequireAccount role="admin"><AdminDashboard /></RequireAccount>} />
          <Route path="/admin-dashboard" element={<Navigate to="/admin" replace />} />
          <Route path="/my-visits" element={<RequireAccount role="patient"><MyVisits /></RequireAccount>} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
        </BookingDraftProvider>
      </AccountProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
