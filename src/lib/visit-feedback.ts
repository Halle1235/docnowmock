import { supabase } from "@/integrations/supabase/client";

export interface VisitFeedback {
  consultation_id: string;
  doctor_rating: number;
  video_rating: number;
  created_at: string;
  comment?: string;
  doctor_name?: string;
}

// The hosted RPCs are added by the standalone feedback migration. Generated types follow the next schema refresh.
export async function myVisitFeedback(): Promise<VisitFeedback[]> {
  const { data, error } = await supabase.rpc("my_visit_feedback" as never);
  if (error) throw error;
  return (data as VisitFeedback[] | null) ?? [];
}

export async function adminVisitFeedback(): Promise<VisitFeedback[]> {
  const { data, error } = await supabase.rpc("admin_visit_feedback" as never);
  if (error) throw error;
  return (data as VisitFeedback[] | null) ?? [];
}

export async function submitVisitFeedback(visitId: string, doctorRating: number, videoRating: number, comment: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("submit_visit_feedback" as never, {
    _consultation_id: visitId, _doctor_rating: doctorRating, _video_rating: videoRating, _comment: comment,
  } as never);
  if (error) throw error;
  return data === true;
}
