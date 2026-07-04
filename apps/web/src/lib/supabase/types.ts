export type Session = {
  id: string;
  user_id: string;
  title: string;
  latitude: number;
  longitude: number;
  planned_for: string;
  created_at: string;
};

export type LoggedObservation = {
  id: string;
  session_id: string;
  user_id: string;
  target: string;
  score: number | null;
  rating: "poor" | "marginal" | "good" | null;
  notes: string | null;
  observed_at: string;
};
