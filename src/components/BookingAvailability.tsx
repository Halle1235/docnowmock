import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { consultationsAcceptingRequests } from "@/lib/booking-continuity";

export default function BookingAvailability() {
  const { t } = useTranslation();
  const { data, isError } = useQuery({
    queryKey: ["booking-availability"],
    queryFn: consultationsAcceptingRequests,
    refetchInterval: 30_000,
    retry: false,
  });
  const status = isError ? "unknown" : data === undefined ? "checking" : data ? "open" : "closed";
  return (
    <p role="status" className="mb-4 inline-flex rounded-lg border bg-card px-3 py-2 text-sm font-medium text-foreground">
      {t(`availability.${status}`)}
    </p>
  );
}
