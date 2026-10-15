export type Mode = "solo" | "tim" | "zadruga";

export type JobStatus =
  | "ZAKAZANO"
  | "DODELJENO"
  | "U TOKU"
  | "ZAVRŠENO"
  | "OTKAZANO"
  | "ČEKA NAPLATU";

export interface Worker {
  id: string;
  name: string;
  role: string;
  trade: string;
  teamId?: string | undefined;
}

export interface Team {
  id: string;
  name: string;
  memberIds: string[];
}

export interface MixedTeamMember {
  workerId: string;
  responsibility: string;
}

export interface MixedTeam {
  id: string;
  name: string;
  project: string;
  members: MixedTeamMember[];
  createdAt: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
}

export interface Job {
  id: string;
  scope: Mode;
  customerId: string;
  description: string;
  date: string; // yyyy-mm-dd
  time: string; // HH:mm
  location: string;
  price: number;
  status: JobStatus;
  paid: boolean;
  assigneeType: "solo" | "worker" | "team" | "mixed" | "none";
  assigneeId?: string | undefined;
  notes?: string | undefined;
}

export interface AppNotification {
  id: string;
  icon: string;
  text: string;
  target?: { type: "job" | "customer" | "worker"; id: string } | undefined;
  read: boolean;
}

export interface DemoState {
  workers: Worker[];
  teams: Team[];
  mixedTeams: MixedTeam[];
  customers: Customer[];
  jobs: Job[];
  notifications: AppNotification[];
}

/* ---- AI structures ---- */
export interface AiAssignment {
  team?: string | undefined;
  worker?: string | undefined;
  customer?: string | undefined;
  time?: string | undefined;
  date?: string | undefined;
  description?: string | undefined;
  /** Cena po dodeli; ranije je `CREATE_ASSIGNMENTS` uvek upisivao 0. */
  price?: number | undefined;
}

export interface AiResult {
  intent: string;
  confidence: number;
  customer?: string | undefined;
  worker?: string | undefined;
  team?: string | undefined;
  description?: string | undefined;
  date?: string | undefined;
  time?: string | undefined;
  price?: number | undefined;
  currency?: string | undefined;
  project?: string | undefined;
  members?: { name: string; trade: string }[] | undefined;
  assignments?: AiAssignment[] | undefined;
  answer?: string | undefined;
  /** Postojeći posao na koji se komanda odnosi (otkazivanje i izmena). */
  jobId?: string | undefined;
  suggestedAction:
    | "CREATE_JOB"
    | "ASSIGN_JOB"
    | "CREATE_ASSIGNMENTS"
    | "CREATE_MIXED_TEAM"
    | "CANCEL_JOB"
    | "UPDATE_JOB"
    | "ADD_TEAM_MEMBER"
    | "ANSWER"
    | "UNKNOWN";
  source?: "ai" | "local" | undefined;
}
