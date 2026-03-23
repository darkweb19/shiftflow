export interface Shift {
  id: string;
  user_id: string;
  date: string;
  start_time: string;
  end_time: string;
  role: string | null;
  station: string | null;
  notes: string | null;
  source_pdf_id: string | null;
  created_at: string;
}

export interface ShiftCoworker {
  id: string;
  user_id: string;
  shift_id: string;
  coworker_name: string;
  created_at: string;
}

export interface Profile {
  id: string;
  name: string;
  email: string;
  gmail_connected: boolean;
  gmail_watch_expiry: string | null;
  employer_email: string | null;
  created_at: string;
  updated_at: string;
}

export interface Pdf {
  id: string;
  user_id: string;
  file_path: string;
  file_name: string;
  hash: string;
  week_start: string | null;
  week_end: string | null;
  status: "pending" | "processing" | "completed" | "failed";
  error_msg: string | null;
  uploaded_at: string;
}
