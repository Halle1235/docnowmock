import { routes } from "./lib/routes";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import PatientInformation from "./pages/PatientInformation";
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
          <Route path={routes.privacy} element={<PatientInformation kind="privacy" />} />
          <Route path={routes.terms} element={<PatientInformation kind="terms" />} />
          <Route path={routes.home} element={<Index />} />
          <Route path={routes.registration} element={<Registration />} />
          <Route path={routes.medicalReason} element={<RequireAccount role="patient"><MedicalReason /></RequireAccount>} />
          <Route path={routes.payment} element={<RequireAccount role="patient"><Payment /></RequireAccount>} />
          <Route path={routes.waitingRoom} element={<RequireAccount role="patient"><WaitingRoom /></RequireAccount>} />
          <Route path={routes.auth} element={<Auth />} />
          <Route path={routes.doctorLogin} element={<Navigate to="/auth?as=doctor" replace />} />
          <Route path={routes.doctorRegistration} element={<DoctorRegistration />} />
          <Route path={routes.resetPassword} element={<ResetPassword />} />
          <Route path={routes.doctorDashboard} element={<RequireAccount role="doctor"><DoctorDashboard /></RequireAccount>} />
          <Route path={routes.call} element={<RequireAccount><VideoCall /></RequireAccount>} />
          <Route path={routes.admin} element={<RequireAccount role="admin"><AdminDashboard /></RequireAccount>} />
          <Route path={routes.adminDashboard} element={<Navigate to="/admin" replace />} />
          <Route path={routes.myVisits} element={<RequireAccount role="patient"><MyVisits /></RequireAccount>} />
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
