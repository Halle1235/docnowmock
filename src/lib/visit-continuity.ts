export interface VisitContinuity {
  id: string;
  status: string;
  room_url: string | null;
  doctor_id: string | null;
  payment_status: string;
}

export function isActiveVisit(visit: Pick<VisitContinuity, "status">) {
  return ["pending", "claimed", "in_progress"].includes(visit.status);
}

export function orderVisitsByActivity<T extends Pick<VisitContinuity, "status">>(visits: T[]) {
  return [...visits.filter(isActiveVisit), ...visits.filter((visit) => !isActiveVisit(visit))];
}

export function canCancelWaitingBooking(visit: VisitContinuity) {
  return visit.status === "pending" && !visit.doctor_id && !visit.room_url && visit.payment_status === "pending";
}

export function activeVisitPath(visit: VisitContinuity) {
  const canJoin = visit.room_url && ["claimed", "in_progress"].includes(visit.status);
  return canJoin
    ? `/call/${encodeURIComponent(visit.id)}`
    : `/waiting-room?id=${encodeURIComponent(visit.id)}`;
}
