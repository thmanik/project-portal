import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type ActorRole =
  | "system_admin"
  | "prime_consultant"
  | "ccr_coordinator"
  | "division_lead"
  | "division_member"
  | "tms_manager"
  | "tms_drawing"
  | "tms_checking"
  | "tms_approval"
  | "client_owner";

export interface Company {
  id: string;
  name: string;
  abbr: string;
  type: string;
}

export interface Division {
  id: string;
  companyId: string;
  name: string;
  abbr: string;
  type: string;
}

export interface Team {
  id: string;
  name: string;
  companyId: string;
  divisionId: string;
  leadMemberId?: string;
  memberIds: string[];
}

export interface Member {
  id: string;
  name: string;
  email: string;
  companyId: string;
  divisionId: string;
  teamId?: string;
  roleTitle: string;
  active: boolean;
}

export interface Client {
  id: string;
  name: string;
  email: string;
  companyId: string;
}

export interface Actor {
  id: string;
  label: string;
  role: ActorRole;
  memberId?: string;
  clientId?: string;
}

export type AttachmentSourceType = "TEXT" | "FILE" | "TEXT_AND_FILE" | "METADATA";
export type AttachmentFileGroup = "PRIMARY" | "WORKFLOW";

export interface AttachmentInput {
  name: string;
  category: string;
  textContent?: string;
  fileName?: string;
  fileType?: string;
  fileSize?: number;
  fileDataUrl?: string;
  workflowStage?: string;
  note?: string;
}

export interface AttachmentRef {
  id: string;
  name: string;
  category: string;
  uploadedBy: string;
  uploadedAt: string;
  sourceType?: AttachmentSourceType;
  fileGroup?: AttachmentFileGroup;
  textContent?: string;
  fileName?: string;
  fileType?: string;
  fileSize?: number;
  fileDataUrl?: string;
  workflowStage?: string;
  note?: string;
  version?: number;
}

export interface ProjectItem {
  id: string;
  code: string;
  name: string;
  type: "BID" | "PROJECT";
  clientId: string;
  clientEmail: string;
  originDivisionId: string;
  sourceChannel: string;
  status: "DRAFT" | "BIDDING" | "ACTIVE" | "COMPLETED" | "ARCHIVED";
  initialDocuments: AttachmentRef[];
  credentialsSent: boolean;
  createdAt: string;
}

export type WorkRequestStatus =
  | "CREATED"
  | "DIVISION_NOTIFIED"
  | "LEADER_ASSIGNED"
  | "MEMBER_REVIEW"
  | "FORWARDED_TO_TMS"
  | "TMS_ASSIGNED"
  | "DRAWING_IN_PROGRESS"
  | "CHECKING_REVIEW"
  | "APPROVAL_REVIEW"
  | "RETURNED_TO_DIVISION"
  | "DIVISION_MEMBER_APPROVED"
  | "DIVISION_MANAGER_APPROVED"
  | "FORWARDED_TO_CCR"
  | "HML_LISTED"
  | "REJECTED";

export interface HistoryEntry {
  id: string;
  at: string;
  by: string;
  action: string;
  from?: string;
  to?: string;
  note?: string;
}

export interface WorkRequest {
  id: string;
  code: string;
  parentType: "BID" | "PROJECT";
  parentId: string;
  title: string;
  category: string;
  priority: "High" | "Medium" | "Low";
  attachmentName: string;
  attachmentCategory: string;
  notes: string;
  assignedDivisionId: string;
  originDivisionId: string;
  currentStatus: WorkRequestStatus;
  assignedLeaderId?: string;
  assignedMemberId?: string;
  tmsAssignments?: {
    managerId?: string;
    drawingId?: string;
    checkingId?: string;
    approvalId?: string;
  };
  drawingDocumentName?: string;
  lastTransferredAt: string;
  revisionHistory: HistoryEntry[];
}

export interface RegistryDocument {
  id: string;
  projectId: string;
  workRequestId: string;
  name: string;
  category: string;
  divisionId: string;
  listedAt: string;
  listedBy: string;
}

export interface PortalSettings {
  portalName: string;
  categories: string[];
  workRequestTypes?: string[];
  projectInfoCategories?: string[];
}
export interface PortalState {
  companies: Company[];
  divisions: Division[];
  teams: Team[];
  members: Member[];
  clients: Client[];
  actors: Actor[];
  currentActorId: string;
  projects: ProjectItem[];
  workRequests: WorkRequest[];
  documents: RegistryDocument[];
  settings: PortalSettings;
}

interface PortalContextValue {
  state: PortalState;
  currentActor: Actor;
  setCurrentActorId: (id: string) => void;
  addCompany: (payload: { name: string; abbr: string; type: string }) => void;
  addDivision: (payload: { companyId: string; name: string; abbr: string; type: string }) => void;
  addTeam: (payload: { name: string; companyId: string; divisionId: string; leadMemberId?: string }) => void;
  addMember: (payload: { name: string; email: string; companyId: string; divisionId: string; teamId?: string; roleTitle: string }) => void;
  addProject: (payload: { name: string; type: "BID" | "PROJECT"; clientId: string; sourceChannel: string; initialDocuments: AttachmentInput[] }) => ProjectItem;
  addClientDocument: (projectId: string, payload: AttachmentInput) => void;
  addWorkRequestDocument: (workRequestId: string, payload: AttachmentInput) => void;
  addWorkRequest: (payload: {
    parentType: "BID" | "PROJECT";
    parentId: string;
    title: string;
    category: string;
    priority: "High" | "Medium" | "Low";
    attachmentName: string;
    attachmentCategory: string;
    notes: string;
    assignedDivisionId: string;
  }) => void;
  assignLeader: (workRequestId: string, leaderId: string) => void;
  assignMember: (workRequestId: string, memberId: string) => void;
  forwardToTms: (workRequestId: string, note?: string) => void;
  assignTmsChain: (workRequestId: string, payload: { drawingId: string; checkingId: string; approvalId: string }) => void;
  submitDrawing: (workRequestId: string, documentName: string) => void;
  reviewChecking: (workRequestId: string, approved: boolean, note?: string) => void;
  reviewApproval: (workRequestId: string, approved: boolean, note?: string) => void;
  originMemberDecision: (workRequestId: string, approved: boolean, note?: string) => void;
  originManagerApprove: (workRequestId: string, note?: string) => void;
  forwardToCcr: (workRequestId: string, note?: string) => void;
  sendBackward: (workRequestId: string, note?: string) => void;
  listFinalDocument: (workRequestId: string, payload: { name: string; category: string }) => void;
  decideBidOutcome: (projectId: string, outcome: "WIN" | "LOSE") => void;
  updateSettings: (payload: Partial<PortalSettings>) => void;
}

const PortalContext = createContext<PortalContextValue | null>(null);

const now = () => new Date().toISOString();
const fmt = (value: string) => new Date(value).toLocaleString();
const uid = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 8)}`;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createSeedAttachment(
  payload: Omit<AttachmentRef, "id" | "uploadedAt" | "version"> & {
    uploadedAt?: string;
    version?: number;
  }
): AttachmentRef {
  return {
    id: uid("att"),
    uploadedAt: payload.uploadedAt || now(),
    version: payload.version || 1,
    ...payload,
  };
}

function createSeedHistory(action: string, by: string, to?: string, note?: string): HistoryEntry {
  return {
    id: uid("hist"),
    at: now(),
    by,
    action,
    to,
    note,
  };
}

function resolveAttachmentSourceType(payload: AttachmentInput): AttachmentSourceType {
  const hasText = Boolean(payload.textContent?.trim());
  const hasFile = Boolean(payload.fileDataUrl || payload.fileName);

  if (hasText && hasFile) return "TEXT_AND_FILE";
  if (hasText) return "TEXT";
  if (hasFile) return "FILE";
  return "METADATA";
}

function normalizeAttachmentKey(value?: string) {
  return (value || "").trim().toLowerCase();
}

function getAutoAttachmentName(payload: AttachmentInput) {
  if (payload.fileName?.trim()) return payload.fileName.trim();
  if (payload.name?.trim()) return payload.name.trim();

  if (payload.textContent?.trim()) {
    return `Text Document - ${new Date().toISOString().slice(0, 19).replace("T", " ")}`;
  }

  return "Untitled document";
}

function getAttachmentKeyFromRef(attachment: AttachmentRef) {
  return normalizeAttachmentKey(attachment.fileName || attachment.name);
}

function getAttachmentKeyFromInput(payload: AttachmentInput) {
  return normalizeAttachmentKey(payload.fileName || payload.name);
}

function getNextAttachmentVersion(existingAttachments: AttachmentRef[], payload: AttachmentInput) {
  const key = getAttachmentKeyFromInput({
    ...payload,
    name: getAutoAttachmentName(payload),
  });

  if (!key) return 1;

  const matchingVersions = existingAttachments
    .filter((attachment) => getAttachmentKeyFromRef(attachment) === key)
    .map((attachment) => attachment.version || 1);

  if (!matchingVersions.length) return 1;
  return Math.max(...matchingVersions) + 1;
}

function createAttachment(
  payload: AttachmentInput,
  uploadedBy: string,
  existingAttachments: AttachmentRef[] = [],
  fileGroup: AttachmentFileGroup = "WORKFLOW"
): AttachmentRef {
  const autoName = getAutoAttachmentName(payload);
  const nextVersion = getNextAttachmentVersion(existingAttachments, { ...payload, name: autoName });

  return {
    id: uid("att"),
    name: autoName,
    category: payload.category,
    uploadedBy,
    uploadedAt: now(),
    sourceType: resolveAttachmentSourceType(payload),
    fileGroup,
    textContent: payload.textContent?.trim() || undefined,
    fileName: payload.fileName?.trim() || undefined,
    fileType: payload.fileType || undefined,
    fileSize: payload.fileSize || undefined,
    fileDataUrl: payload.fileDataUrl || undefined,
    workflowStage: payload.workflowStage || (fileGroup === "PRIMARY" ? "Project / Bid Intake" : "Workflow Collaboration"),
    note: payload.note?.trim() || undefined,
    version: nextVersion,
  };
}

function createSeedState(): PortalState {
  const companies: Company[] = [
    { id: "company-deme", name: "DEME", abbr: "DEME", type: "End Client / Cargo Owner" },
    { id: "company-hml", name: "HML", abbr: "HML", type: "Portal Owner" },
    { id: "company-tms", name: "TMS", abbr: "TMS", type: "Technical Management Service" },
  ];

  const divisions: Division[] = [
    { id: "div-ccr", companyId: "company-hml", name: "CCR Division", abbr: "CCR", type: "Marketing Division of HML" },
    { id: "div-ecm", companyId: "company-hml", name: "ECM Division", abbr: "ECM", type: "Engineering Division of HML" },
    { id: "div-pmo", companyId: "company-hml", name: "PMO Division", abbr: "PMO", type: "Operation Division of HML" },
    { id: "div-tms-eng", companyId: "company-tms", name: "TMS-Eng", abbr: "TMS", type: "Drawing / Checking / Approval" },
    { id: "div-tms-it", companyId: "company-tms", name: "TMS-IT", abbr: "TMS-IT", type: "System / IT Support" },
  ];

  const members: Member[] = [
    { id: "member-prime", name: "Prime Consultant", email: "prime@hml.com", companyId: "company-hml", divisionId: "div-ccr", roleTitle: "Prime Consultant", active: true },
    { id: "member-ccr-1", name: "Ahmad Rahman", email: "ccr@hml.com", companyId: "company-hml", divisionId: "div-ccr", roleTitle: "CCR Coordinator", active: true },
    { id: "member-ecm-lead", name: "Dr. Yusof Ismail", email: "ecmlead@hml.com", companyId: "company-hml", divisionId: "div-ecm", roleTitle: "ECM Team Leader", active: true },
    { id: "member-ecm-1", name: "Lisa Wang", email: "ecm1@hml.com", companyId: "company-hml", divisionId: "div-ecm", roleTitle: "ECM Member", active: true },
    { id: "member-pmo-lead", name: "PMO Lead", email: "pmolead@hml.com", companyId: "company-hml", divisionId: "div-pmo", roleTitle: "PMO Team Leader", active: true },
    { id: "member-pmo-1", name: "PMO-M1", email: "pmo1@hml.com", companyId: "company-hml", divisionId: "div-pmo", roleTitle: "PMO Member", active: true },
    { id: "member-tms-manager", name: "Tan Wei Ming", email: "manager@tms.com", companyId: "company-tms", divisionId: "div-tms-eng", roleTitle: "TMS Manager", active: true },
    { id: "member-tms-m1", name: "Aisha Binti", email: "drawing@tms.com", companyId: "company-tms", divisionId: "div-tms-eng", roleTitle: "TMS-M1 Drawing Member", active: true },
    { id: "member-tms-m2", name: "Mark Johnson", email: "checking@tms.com", companyId: "company-tms", divisionId: "div-tms-eng", roleTitle: "TMS-M2 Checking Member", active: true },
    { id: "member-tms-m3", name: "Priya Nair", email: "approval@tms.com", companyId: "company-tms", divisionId: "div-tms-eng", roleTitle: "TMS-M3 Approval Member", active: true },
  ];

  const teams: Team[] = [
    { id: "team-ccr", name: "CCR Team", companyId: "company-hml", divisionId: "div-ccr", leadMemberId: "member-ccr-1", memberIds: ["member-prime", "member-ccr-1"] },
    { id: "team-ecm", name: "ECM Team", companyId: "company-hml", divisionId: "div-ecm", leadMemberId: "member-ecm-lead", memberIds: ["member-ecm-lead", "member-ecm-1"] },
    { id: "team-pmo", name: "PMO Team", companyId: "company-hml", divisionId: "div-pmo", leadMemberId: "member-pmo-lead", memberIds: ["member-pmo-lead", "member-pmo-1"] },
    { id: "team-tms", name: "TMS Engineering Team", companyId: "company-tms", divisionId: "div-tms-eng", leadMemberId: "member-tms-manager", memberIds: ["member-tms-manager", "member-tms-m1", "member-tms-m2", "member-tms-m3"] },
  ];

  const clients: Client[] = [{ id: "client-deme", name: "DEME", email: "projects@deme.com", companyId: "company-deme" }];

  const actors: Actor[] = [
    { id: "actor-admin", label: "System Admin", role: "system_admin" },
    { id: "actor-prime", label: "Prime Consultant", role: "prime_consultant", memberId: "member-prime" },
    { id: "actor-ccr", label: "CCR Coordinator", role: "ccr_coordinator", memberId: "member-ccr-1" },
    { id: "actor-ecm-lead", label: "ECM Lead", role: "division_lead", memberId: "member-ecm-lead" },
    { id: "actor-ecm-m1", label: "ECM-M1", role: "division_member", memberId: "member-ecm-1" },
    { id: "actor-pmo-lead", label: "PMO Lead", role: "division_lead", memberId: "member-pmo-lead" },
    { id: "actor-pmo-m1", label: "PMO-M1", role: "division_member", memberId: "member-pmo-1" },
    { id: "actor-tms-manager", label: "TMS Manager", role: "tms_manager", memberId: "member-tms-manager" },
    { id: "actor-tms-drawing", label: "TMS-M1", role: "tms_drawing", memberId: "member-tms-m1" },
    { id: "actor-tms-checking", label: "TMS-M2", role: "tms_checking", memberId: "member-tms-m2" },
    { id: "actor-tms-approval", label: "TMS-M3", role: "tms_approval", memberId: "member-tms-m3" },
    { id: "actor-client", label: "Client / Owner (DEME)", role: "client_owner", clientId: "client-deme" },
  ];

  const primaryDoc = createSeedAttachment({
    name: "DEME Initial Request.pdf",
    category: "Client Request",
    uploadedBy: "Ahmad Rahman",
    sourceType: "METADATA",
    fileGroup: "PRIMARY",
    fileName: "DEME Initial Request.pdf",
    fileType: "application/pdf",
    workflowStage: "Project / Bid Intake",
    note: "Original client request uploaded by CCR / Marketing.",
  });

  const project: ProjectItem = {
    id: "project-bid-26001",
    code: "BID-26001",
    name: "DEME Offshore Cargo Coordination",
    type: "BID",
    clientId: "client-deme",
    clientEmail: "projects@deme.com",
    originDivisionId: "div-ccr",
    sourceChannel: "Email Intake",
    status: "BIDDING",
    initialDocuments: [primaryDoc],
    credentialsSent: true,
    createdAt: now(),
  };

  const workRequests: WorkRequest[] = [
    {
      id: "wr-26001-001",
      code: "WR-001",
      parentType: "BID",
      parentId: project.id,
      title: "Stowage Plan",
      category: "Stowage Plan",
      priority: "High",
      attachmentName: primaryDoc.name,
      attachmentCategory: primaryDoc.category,
      notes: "Initial cargo arrangement request from DEME.",
      assignedDivisionId: "div-ecm",
      originDivisionId: "div-ecm",
      currentStatus: "DIVISION_NOTIFIED",
      lastTransferredAt: now(),
      revisionHistory: [
        createSeedHistory("Work request created under BID-26001 and assigned to ECM.", "Ahmad Rahman", "ECM"),
      ],
    },
  ];

  return {
    companies,
    divisions,
    teams,
    members,
    clients,
    actors,
    currentActorId: "actor-prime",
    projects: [project],
    workRequests,
    documents: [],
    settings: {
      portalName: "Project Management Portal",
      categories: ["Client Request", "Engineering", "General"],
      workRequestTypes: [
        "Stowage Plan",
        "Voyage Condition",
        "Mooring Plan",
        "Mooring Analysis",
        "Grillade & Sea-Fastening Plan",
        "Berthing Feasibility",
        "Loadout Feasibility",
        "Motion Analysis",
      ],
      projectInfoCategories: ["Cargo Info", "Port Info", "SPMT Info", "Vessel info", "General info"],
    },
  };
}

const STORAGE_KEY = "project-portal-state-v6";

export function PortalDataProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PortalState>(() => {
    if (typeof window === "undefined") return createSeedState();

    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return createSeedState();

    try {
      return JSON.parse(stored) as PortalState;
    } catch {
      return createSeedState();
    }
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  }, [state]);

  const currentActor = useMemo(
    () => state.actors.find((actor) => actor.id === state.currentActorId) || state.actors[0],
    [state.actors, state.currentActorId]
  );

  const actorLabel = useCallback(() => currentActor.label, [currentActor.label]);
  const memberName = useCallback((memberId?: string) => state.members.find((m) => m.id === memberId)?.name || "Unknown", [state.members]);
  const divisionName = useCallback((divisionId?: string) => state.divisions.find((d) => d.id === divisionId)?.abbr || "Unknown", [state.divisions]);

  const setCurrentActorId = useCallback((id: string) => {
    setState((prev) => ({ ...prev, currentActorId: id }));
  }, []);

  const addCompany = useCallback((payload: { name: string; abbr: string; type: string }) => {
    setState((prev) => ({ ...prev, companies: [...prev.companies, { id: uid("company"), ...payload }] }));
  }, []);

  const addDivision = useCallback((payload: { companyId: string; name: string; abbr: string; type: string }) => {
    setState((prev) => ({ ...prev, divisions: [...prev.divisions, { id: uid("division"), ...payload }] }));
  }, []);

  const addTeam = useCallback((payload: { name: string; companyId: string; divisionId: string; leadMemberId?: string }) => {
    setState((prev) => ({
      ...prev,
      teams: [...prev.teams, { id: uid("team"), ...payload, memberIds: payload.leadMemberId ? [payload.leadMemberId] : [] }],
    }));
  }, []);

  const addMember = useCallback((payload: { name: string; email: string; companyId: string; divisionId: string; teamId?: string; roleTitle: string }) => {
    const memberId = uid("member");

    setState((prev) => {
      const next = clone(prev);
      next.members.push({ id: memberId, active: true, ...payload });

      if (payload.teamId) {
        const team = next.teams.find((teamItem) => teamItem.id === payload.teamId);
        if (team && !team.memberIds.includes(memberId)) team.memberIds.push(memberId);
      }

      return next;
    });
  }, []);

  const addProject = useCallback(
    (payload: { name: string; type: "BID" | "PROJECT"; clientId: string; sourceChannel: string; initialDocuments: AttachmentInput[] }) => {
      const client = state.clients.find((item) => item.id === payload.clientId);
      const bidCount = state.projects.filter((project) => project.type === "BID").length + 1;
      const projectCount = state.projects.filter((project) => project.type === "PROJECT").length + 1;
      const code = payload.type === "BID" ? `BID-${26000 + bidCount}` : `PRJ-${26000 + projectCount}`;

      const primaryFiles: AttachmentRef[] = [];
      payload.initialDocuments.forEach((doc) => {
        primaryFiles.push(createAttachment({ ...doc, workflowStage: doc.workflowStage || "Project / Bid Intake" }, actorLabel(), primaryFiles, "PRIMARY"));
      });

      const project: ProjectItem = {
        id: uid("project"),
        code,
        name: payload.name,
        type: payload.type,
        clientId: payload.clientId,
        clientEmail: client?.email || "",
        originDivisionId: "div-ccr",
        sourceChannel: payload.sourceChannel,
        status: payload.type === "BID" ? "BIDDING" : "ACTIVE",
        initialDocuments: primaryFiles,
        credentialsSent: true,
        createdAt: now(),
      };

      setState((prev) => ({ ...prev, projects: [project, ...prev.projects] }));
      return project;
    },
    [actorLabel, state.clients, state.projects]
  );

  const addClientDocument = useCallback(
    (projectId: string, payload: AttachmentInput) => {
      setState((prev) => ({
        ...prev,
        projects: prev.projects.map((project) =>
          project.id === projectId
            ? {
                ...project,
                initialDocuments: [
                  ...project.initialDocuments,
                  createAttachment({ ...payload, workflowStage: payload.workflowStage || "Client Upload" }, actorLabel(), project.initialDocuments, "WORKFLOW"),
                ],
              }
            : project
        ),
      }));
    },
    [actorLabel]
  );

  const addWorkRequestDocument = useCallback(
    (workRequestId: string, payload: AttachmentInput) => {
      setState((prev) => {
        const next = clone(prev);
        const request = next.workRequests.find((item) => item.id === workRequestId);
        if (!request) return prev;

        const project = next.projects.find((item) => item.id === request.parentId);
        if (!project) return prev;

        const attachment = createAttachment(
          { ...payload, workflowStage: payload.workflowStage || getWorkRequestStatusLabel(request.currentStatus) },
          actorLabel(),
          project.initialDocuments,
          "WORKFLOW"
        );

        project.initialDocuments.push(attachment);
        request.revisionHistory.unshift({
          id: uid("hist"),
          at: now(),
          by: actorLabel(),
          action: `Uploaded workflow document ${attachment.name} v${attachment.version || 1}`,
          to: attachment.workflowStage,
          note: attachment.note,
        });
        request.lastTransferredAt = now();

        return next;
      });
    },
    [actorLabel]
  );

  const addWorkRequest = useCallback(
    (payload: {
      parentType: "BID" | "PROJECT";
      parentId: string;
      title: string;
      category: string;
      priority: "High" | "Medium" | "Low";
      attachmentName: string;
      attachmentCategory: string;
      notes: string;
      assignedDivisionId: string;
    }) => {
      setState((prev) => {
        const parent = prev.projects.find((project) => project.id === payload.parentId);
        if (!parent) return prev;

        if (parent.type === "BID") {
          const bidAlreadyHasWorkRequest = prev.workRequests.some((request) => request.parentId === parent.id);
          if (bidAlreadyHasWorkRequest) return prev;
        }

        const next = clone(prev);

        const workRequest: WorkRequest = {
          id: uid("wr"),
          code: `WR-${String(next.workRequests.length + 1).padStart(3, "0")}`,
          parentType: parent.type,
          parentId: payload.parentId,
          title: payload.title,
          category: payload.category,
          priority: payload.priority,
          attachmentName: payload.attachmentName,
          attachmentCategory: payload.attachmentCategory,
          notes: payload.notes,
          assignedDivisionId: payload.assignedDivisionId,
          originDivisionId: payload.assignedDivisionId,
          currentStatus: "DIVISION_NOTIFIED",
          lastTransferredAt: now(),
          revisionHistory: [
            {
              id: uid("hist"),
              at: now(),
              by: actorLabel(),
              action: `${payload.title} created under ${parent.code} and assigned to ${divisionName(payload.assignedDivisionId)}.`,
              to: divisionName(payload.assignedDivisionId),
            },
          ],
        };

        next.workRequests.unshift(workRequest);
        return next;
      });
    },
    [actorLabel, divisionName]
  );

  const updateRequest = useCallback((workRequestId: string, updater: (request: WorkRequest) => void) => {
    setState((prev) => {
      const next = clone(prev);
      const request = next.workRequests.find((item) => item.id === workRequestId);
      if (!request) return prev;

      updater(request);
      return next;
    });
  }, []);

  const pushHistory = useCallback((request: WorkRequest, entry: Omit<HistoryEntry, "id" | "at">) => {
    request.revisionHistory.unshift({ id: uid("hist"), at: now(), ...entry });
    request.lastTransferredAt = now();
  }, []);

  const assignLeader = useCallback(
    (workRequestId: string, leaderId: string) => {
      updateRequest(workRequestId, (request) => {
        request.assignedLeaderId = leaderId;
        request.currentStatus = "LEADER_ASSIGNED";
        pushHistory(request, {
          by: actorLabel(),
          action: `${memberName(leaderId)} assigned as division lead.`,
          to: memberName(leaderId),
        });
      });
    },
    [actorLabel, memberName, pushHistory, updateRequest]
  );

  const assignMember = useCallback(
    (workRequestId: string, memberId: string) => {
      updateRequest(workRequestId, (request) => {
        request.assignedMemberId = memberId;
        request.currentStatus = "MEMBER_REVIEW";
        pushHistory(request, {
          by: actorLabel(),
          action: `${memberName(memberId)} assigned for review and forwarding.`,
          to: memberName(memberId),
        });
      });
    },
    [actorLabel, memberName, pushHistory, updateRequest]
  );

  const forwardToTms = useCallback(
    (workRequestId: string, note?: string) => {
      updateRequest(workRequestId, (request) => {
        request.currentStatus = "FORWARDED_TO_TMS";
        pushHistory(request, {
          by: actorLabel(),
          action: `Forwarded from ${divisionName(request.originDivisionId)} to TMS.`,
          from: divisionName(request.originDivisionId),
          to: "TMS",
          note,
        });
      });
    },
    [actorLabel, divisionName, pushHistory, updateRequest]
  );

  const assignTmsChain = useCallback(
    (workRequestId: string, payload: { drawingId: string; checkingId: string; approvalId: string }) => {
      updateRequest(workRequestId, (request) => {
        request.tmsAssignments = {
          managerId: currentActor.memberId,
          drawingId: payload.drawingId,
          checkingId: payload.checkingId,
          approvalId: payload.approvalId,
        };
        request.currentStatus = "TMS_ASSIGNED";
        pushHistory(request, {
          by: actorLabel(),
          action: `TMS manager assigned M1 Drawing ${memberName(payload.drawingId)}, M2 Checking ${memberName(payload.checkingId)}, M3 Approval ${memberName(payload.approvalId)}.`,
          to: "TMS Workflow",
        });
      });
    },
    [actorLabel, currentActor.memberId, memberName, pushHistory, updateRequest]
  );

  const submitDrawing = useCallback(
    (workRequestId: string, documentName: string) => {
      updateRequest(workRequestId, (request) => {
        request.drawingDocumentName = documentName;
        request.currentStatus = "CHECKING_REVIEW";
        pushHistory(request, {
          by: actorLabel(),
          action: `TMS-M1 drawing submitted to TMS-M2 checking stage as ${documentName}.`,
          to: memberName(request.tmsAssignments?.checkingId),
        });
      });
    },
    [actorLabel, memberName, pushHistory, updateRequest]
  );

  const reviewChecking = useCallback(
    (workRequestId: string, approved: boolean, note?: string) => {
      updateRequest(workRequestId, (request) => {
        if (approved) {
          request.currentStatus = "APPROVAL_REVIEW";
          pushHistory(request, {
            by: actorLabel(),
            action: "TMS-M2 checking approved and forwarded to TMS-M3 approval.",
            to: memberName(request.tmsAssignments?.approvalId),
            note,
          });
        } else {
          request.currentStatus = "DRAWING_IN_PROGRESS";
          pushHistory(request, {
            by: actorLabel(),
            action: "TMS-M2 checking rejected and returned to TMS-M1 drawing.",
            to: memberName(request.tmsAssignments?.drawingId),
            note,
          });
        }
      });
    },
    [actorLabel, memberName, pushHistory, updateRequest]
  );

  const reviewApproval = useCallback(
    (workRequestId: string, approved: boolean, note?: string) => {
      updateRequest(workRequestId, (request) => {
        if (approved) {
          request.currentStatus = "RETURNED_TO_DIVISION";
          pushHistory(request, {
            by: actorLabel(),
            action: `TMS-M3 approval complete and returned to ${divisionName(request.originDivisionId)} member.`,
            to: divisionName(request.originDivisionId),
            note,
          });
        } else {
          request.currentStatus = "DRAWING_IN_PROGRESS";
          pushHistory(request, {
            by: actorLabel(),
            action: "TMS-M3 approval rejected and returned to TMS-M1 drawing.",
            to: memberName(request.tmsAssignments?.drawingId),
            note,
          });
        }
      });
    },
    [actorLabel, divisionName, memberName, pushHistory, updateRequest]
  );

  const originMemberDecision = useCallback(
    (workRequestId: string, approved: boolean, note?: string) => {
      updateRequest(workRequestId, (request) => {
        if (approved) {
          request.currentStatus = "DIVISION_MEMBER_APPROVED";
          pushHistory(request, {
            by: actorLabel(),
            action: `${divisionName(request.originDivisionId)} member approved returned TMS package.`,
            note,
          });
        } else {
          request.currentStatus = "FORWARDED_TO_TMS";
          pushHistory(request, {
            by: actorLabel(),
            action: `${divisionName(request.originDivisionId)} member rejected package and returned it to TMS.`,
            to: "TMS",
            note,
          });
        }
      });
    },
    [actorLabel, divisionName, pushHistory, updateRequest]
  );

  const originManagerApprove = useCallback(
    (workRequestId: string, note?: string) => {
      updateRequest(workRequestId, (request) => {
        request.currentStatus = "DIVISION_MANAGER_APPROVED";
        pushHistory(request, {
          by: actorLabel(),
          action: `${divisionName(request.originDivisionId)} manager approved the package.`,
          note,
        });
      });
    },
    [actorLabel, divisionName, pushHistory, updateRequest]
  );

  const forwardToCcr = useCallback(
    (workRequestId: string, note?: string) => {
      updateRequest(workRequestId, (request) => {
        request.currentStatus = "FORWARDED_TO_CCR";
        pushHistory(request, {
          by: actorLabel(),
          action: `${divisionName(request.originDivisionId)} manager forwarded the package to CCR for final listing.`,
          to: "CCR",
          note,
        });
      });
    },
    [actorLabel, divisionName, pushHistory, updateRequest]
  );

  const sendBackward = useCallback(
    (workRequestId: string, note?: string) => {
      updateRequest(workRequestId, (request) => {
        const backwardMap: Partial<Record<WorkRequestStatus, { status: WorkRequestStatus; label: string; to?: string }>> = {
          LEADER_ASSIGNED: { status: "DIVISION_NOTIFIED", label: "Division Notified", to: divisionName(request.assignedDivisionId) },
          MEMBER_REVIEW: { status: "LEADER_ASSIGNED", label: "Division Lead Assignment", to: memberName(request.assignedLeaderId) },
          FORWARDED_TO_TMS: { status: "MEMBER_REVIEW", label: "Division Member Review", to: memberName(request.assignedMemberId) },
          TMS_ASSIGNED: { status: "FORWARDED_TO_TMS", label: "TMS Manager Intake", to: "TMS Manager" },
          DRAWING_IN_PROGRESS: { status: "TMS_ASSIGNED", label: "TMS Chain Assignment", to: "TMS Manager" },
          CHECKING_REVIEW: { status: "DRAWING_IN_PROGRESS", label: "TMS-M1 Drawing Rework", to: memberName(request.tmsAssignments?.drawingId) },
          APPROVAL_REVIEW: { status: "CHECKING_REVIEW", label: "TMS-M2 Checking Rework", to: memberName(request.tmsAssignments?.checkingId) },
          RETURNED_TO_DIVISION: { status: "APPROVAL_REVIEW", label: "TMS-M3 Approval Rework", to: memberName(request.tmsAssignments?.approvalId) },
          DIVISION_MEMBER_APPROVED: { status: "RETURNED_TO_DIVISION", label: "Division Member Final Review", to: memberName(request.assignedMemberId) },
          DIVISION_MANAGER_APPROVED: { status: "DIVISION_MEMBER_APPROVED", label: "Division Member Approved Stage", to: memberName(request.assignedMemberId) },
          FORWARDED_TO_CCR: { status: "DIVISION_MANAGER_APPROVED", label: "Division Manager Approval", to: divisionName(request.originDivisionId) },
        };

        const target = backwardMap[request.currentStatus];
        if (!target) return;

        const previousStatus = request.currentStatus;
        request.currentStatus = target.status;
        pushHistory(request, {
          by: actorLabel(),
          action: `Sent backward from ${getWorkRequestStatusLabel(previousStatus)} to ${target.label}.`,
          from: getWorkRequestStatusLabel(previousStatus),
          to: target.to || target.label,
          note,
        });
      });
    },
    [actorLabel, divisionName, memberName, pushHistory, updateRequest]
  );

  const listFinalDocument = useCallback(
    (workRequestId: string, payload: { name: string; category: string }) => {
      setState((prev) => {
        const next = clone(prev);
        const request = next.workRequests.find((item) => item.id === workRequestId);
        if (!request) return prev;

        request.currentStatus = "HML_LISTED";
        request.lastTransferredAt = now();
        request.revisionHistory.unshift({
          id: uid("hist"),
          at: now(),
          by: actorLabel(),
          action: `CCR listed final document ${payload.name} in HML registry.`,
          to: "HML Document List",
        });

        next.documents.unshift({
          id: uid("doc"),
          projectId: request.parentId,
          workRequestId,
          name: payload.name,
          category: payload.category,
          divisionId: request.originDivisionId,
          listedAt: now(),
          listedBy: actorLabel(),
        });

        return next;
      });
    },
    [actorLabel]
  );

  const decideBidOutcome = useCallback(
    (projectId: string, outcome: "WIN" | "LOSE") => {
      setState((prev) => {
        const next = clone(prev);
        const project = next.projects.find((item) => item.id === projectId);
        if (!project || project.type !== "BID") return prev;

        const relatedRequests = next.workRequests.filter((request) => request.parentId === project.id);
        const bidIsReady = relatedRequests.some((request) => request.currentStatus === "HML_LISTED");
        if (!bidIsReady) return prev;

        if (outcome === "WIN") {
          const previousCode = project.code;
          project.type = "PROJECT";
          project.status = "ACTIVE";
          project.code = previousCode.startsWith("BID-")
            ? previousCode.replace("BID-", "PRJ-")
            : `PRJ-${26000 + next.projects.filter((item) => item.type === "PROJECT").length + 1}`;

          relatedRequests.forEach((request) => {
            request.parentType = "PROJECT";
            request.revisionHistory.unshift({
              id: uid("hist"),
              at: now(),
              by: actorLabel(),
              action: `Bid marked as won and converted from ${previousCode} to ${project.code}.`,
              from: previousCode,
              to: project.code,
            });
          });
        } else {
          project.status = "ARCHIVED";

          relatedRequests.forEach((request) => {
            request.revisionHistory.unshift({
              id: uid("hist"),
              at: now(),
              by: actorLabel(),
              action: `Bid marked as lost and moved to archive.`,
              from: project.code,
              to: "Archive",
            });
          });
        }

        return next;
      });
    },
    [actorLabel]
  );

  const updateSettings = useCallback((payload: Partial<PortalSettings>) => {
    setState((prev) => ({ ...prev, settings: { ...prev.settings, ...payload } }));
  }, []);

  const value = useMemo<PortalContextValue>(
    () => ({
      state,
      currentActor,
      setCurrentActorId,
      addCompany,
      addDivision,
      addTeam,
      addMember,
      addProject,
      addClientDocument,
      addWorkRequestDocument,
      addWorkRequest,
      assignLeader,
      assignMember,
      forwardToTms,
      assignTmsChain,
      submitDrawing,
      reviewChecking,
      reviewApproval,
      originMemberDecision,
      originManagerApprove,
      forwardToCcr,
      sendBackward,
      listFinalDocument,
      decideBidOutcome,
      updateSettings,
    }),
    [
      state,
      currentActor,
      setCurrentActorId,
      addCompany,
      addDivision,
      addTeam,
      addMember,
      addProject,
      addClientDocument,
      addWorkRequestDocument,
      addWorkRequest,
      assignLeader,
      assignMember,
      forwardToTms,
      assignTmsChain,
      submitDrawing,
      reviewChecking,
      reviewApproval,
      originMemberDecision,
      originManagerApprove,
      forwardToCcr,
      sendBackward,
      listFinalDocument,
      decideBidOutcome,
      updateSettings,
    ]
  );

  return <PortalContext.Provider value={value}>{children}</PortalContext.Provider>;
}

export function usePortal() {
  const ctx = useContext(PortalContext);
  if (!ctx) throw new Error("usePortal must be used within PortalDataProvider");
  return ctx;
}

export function getProjectLabel(project: ProjectItem) {
  return `${project.code} — ${project.name}`;
}

export function getWorkRequestStatusLabel(status: WorkRequestStatus) {
  return {
    CREATED: "Created",
    DIVISION_NOTIFIED: "Division Notified",
    LEADER_ASSIGNED: "Division Lead Assigned",
    MEMBER_REVIEW: "Division Member Review",
    FORWARDED_TO_TMS: "Forwarded to TMS Manager",
    TMS_ASSIGNED: "TMS Chain Assigned",
    DRAWING_IN_PROGRESS: "TMS-M1 Drawing",
    CHECKING_REVIEW: "TMS-M2 Checking",
    APPROVAL_REVIEW: "TMS-M3 Approval",
    RETURNED_TO_DIVISION: "Returned to Division Member",
    DIVISION_MEMBER_APPROVED: "Division Member Approved",
    DIVISION_MANAGER_APPROVED: "Division Manager Approved",
    FORWARDED_TO_CCR: "Forwarded to CCR",
    HML_LISTED: "Listed in HML",
    REJECTED: "Rejected",
  }[status];
}

export function statusToSimple(status: WorkRequestStatus): "pending" | "active" | "in-progress" | "completed" | "rejected" | "draft" {
  if (["HML_LISTED"].includes(status)) return "completed";
  if (["REJECTED"].includes(status)) return "rejected";
  if (["CREATED"].includes(status)) return "draft";
  if (
    [
      "DIVISION_NOTIFIED",
      "LEADER_ASSIGNED",
      "MEMBER_REVIEW",
      "FORWARDED_TO_TMS",
      "TMS_ASSIGNED",
      "DRAWING_IN_PROGRESS",
      "CHECKING_REVIEW",
      "APPROVAL_REVIEW",
      "RETURNED_TO_DIVISION",
      "DIVISION_MEMBER_APPROVED",
      "DIVISION_MANAGER_APPROVED",
      "FORWARDED_TO_CCR",
    ].includes(status)
  ) {
    return "in-progress";
  }
  return "pending";
}

export function actorCanManageProjects(role: ActorRole) {
  return ["system_admin", "prime_consultant", "ccr_coordinator"].includes(role);
}

export function actorCanCreateWorkRequests(role: ActorRole) {
  return ["system_admin", "prime_consultant", "ccr_coordinator"].includes(role);
}

export function belongsToDivision(member: Member | undefined, divisionId: string) {
  return member?.divisionId === divisionId;
}

export function formatDate(value: string) {
  return fmt(value);
}





// import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

// export type ActorRole =
//   | "system_admin"
//   | "prime_consultant"
//   | "ccr_coordinator"
//   | "division_lead"
//   | "division_member"
//   | "tms_manager"
//   | "tms_drawing"
//   | "tms_checking"
//   | "tms_approval"
//   | "client_owner";

// export interface Company {
//   id: string;
//   name: string;
//   abbr: string;
//   type: string;
// }

// export interface Division {
//   id: string;
//   companyId: string;
//   name: string;
//   abbr: string;
//   type: string;
// }

// export interface Team {
//   id: string;
//   name: string;
//   companyId: string;
//   divisionId: string;
//   leadMemberId?: string;
//   memberIds: string[];
// }

// export interface Member {
//   id: string;
//   name: string;
//   email: string;
//   companyId: string;
//   divisionId: string;
//   teamId?: string;
//   roleTitle: string;
//   active: boolean;
// }

// export interface Client {
//   id: string;
//   name: string;
//   email: string;
//   companyId: string;
// }

// export interface Actor {
//   id: string;
//   label: string;
//   role: ActorRole;
//   memberId?: string;
//   clientId?: string;
// }

// export type AttachmentSourceType = "TEXT" | "FILE" | "TEXT_AND_FILE" | "METADATA";

// export interface AttachmentInput {
//   name: string;
//   category: string;
//   textContent?: string;
//   fileName?: string;
//   fileType?: string;
//   fileSize?: number;
//   fileDataUrl?: string;
//   workflowStage?: string;
//   note?: string;
// }

// export interface AttachmentRef {
//   id: string;
//   name: string;
//   category: string;
//   uploadedBy: string;
//   uploadedAt: string;
//   sourceType?: AttachmentSourceType;
//   textContent?: string;
//   fileName?: string;
//   fileType?: string;
//   fileSize?: number;
//   fileDataUrl?: string;
//   workflowStage?: string;
//   note?: string;
//   version?: number;
// }

// export interface ProjectItem {
//   id: string;
//   code: string;
//   name: string;
//   type: "BID" | "PROJECT";
//   clientId: string;
//   clientEmail: string;
//   originDivisionId: string;
//   sourceChannel: string;
//   status: "DRAFT" | "BIDDING" | "ACTIVE" | "COMPLETED";
//   initialDocuments: AttachmentRef[];
//   credentialsSent: boolean;
//   createdAt: string;
// }

// export type WorkRequestStatus =
//   | "CREATED"
//   | "DIVISION_NOTIFIED"
//   | "LEADER_ASSIGNED"
//   | "MEMBER_REVIEW"
//   | "FORWARDED_TO_TMS"
//   | "TMS_ASSIGNED"
//   | "DRAWING_IN_PROGRESS"
//   | "CHECKING_REVIEW"
//   | "APPROVAL_REVIEW"
//   | "RETURNED_TO_DIVISION"
//   | "DIVISION_MEMBER_APPROVED"
//   | "DIVISION_MANAGER_APPROVED"
//   | "FORWARDED_TO_CCR"
//   | "HML_LISTED"
//   | "REJECTED";

// export interface HistoryEntry {
//   id: string;
//   at: string;
//   by: string;
//   action: string;
//   from?: string;
//   to?: string;
//   note?: string;
// }

// export interface WorkRequest {
//   id: string;
//   code: string;
//   parentType: "BID" | "PROJECT";
//   parentId: string;
//   title: string;
//   category: string;
//   priority: "High" | "Medium" | "Low";
//   attachmentName: string;
//   attachmentCategory: string;
//   notes: string;
//   assignedDivisionId: string;
//   originDivisionId: string;
//   currentStatus: WorkRequestStatus;
//   assignedLeaderId?: string;
//   assignedMemberId?: string;
//   tmsAssignments?: {
//     managerId?: string;
//     drawingId?: string;
//     checkingId?: string;
//     approvalId?: string;
//   };
//   drawingDocumentName?: string;
//   lastTransferredAt: string;
//   revisionHistory: HistoryEntry[];
// }

// export interface RegistryDocument {
//   id: string;
//   projectId: string;
//   workRequestId: string;
//   name: string;
//   category: string;
//   divisionId: string;
//   listedAt: string;
//   listedBy: string;
// }

// export interface PortalSettings {
//   portalName: string;
//   categories: string[];
// }

// export interface PortalState {
//   companies: Company[];
//   divisions: Division[];
//   teams: Team[];
//   members: Member[];
//   clients: Client[];
//   actors: Actor[];
//   currentActorId: string;
//   projects: ProjectItem[];
//   workRequests: WorkRequest[];
//   documents: RegistryDocument[];
//   settings: PortalSettings;
// }

// interface PortalContextValue {
//   state: PortalState;
//   currentActor: Actor;
//   setCurrentActorId: (id: string) => void;
//   addCompany: (payload: { name: string; abbr: string; type: string }) => void;
//   addDivision: (payload: { companyId: string; name: string; abbr: string; type: string }) => void;
//   addTeam: (payload: { name: string; companyId: string; divisionId: string; leadMemberId?: string }) => void;
//   addMember: (payload: { name: string; email: string; companyId: string; divisionId: string; teamId?: string; roleTitle: string }) => void;
//   addProject: (payload: { name: string; type: "BID" | "PROJECT"; clientId: string; sourceChannel: string; initialDocuments: AttachmentInput[] }) => ProjectItem;
//   addClientDocument: (projectId: string, payload: AttachmentInput) => void;
//   addWorkRequestDocument: (workRequestId: string, payload: AttachmentInput) => void;
//   addWorkRequest: (payload: {
//     parentType: "BID" | "PROJECT";
//     parentId: string;
//     title: string;
//     category: string;
//     priority: "High" | "Medium" | "Low";
//     attachmentName: string;
//     attachmentCategory: string;
//     notes: string;
//     assignedDivisionId: string;
//   }) => void;
//   assignLeader: (workRequestId: string, leaderId: string) => void;
//   assignMember: (workRequestId: string, memberId: string) => void;
//   forwardToTms: (workRequestId: string, note?: string) => void;
//   assignTmsChain: (workRequestId: string, payload: { drawingId: string; checkingId: string; approvalId: string }) => void;
//   submitDrawing: (workRequestId: string, documentName: string) => void;
//   reviewChecking: (workRequestId: string, approved: boolean, note?: string) => void;
//   reviewApproval: (workRequestId: string, approved: boolean, note?: string) => void;
//   originMemberDecision: (workRequestId: string, approved: boolean, note?: string) => void;
//   originManagerApprove: (workRequestId: string, note?: string) => void;
//   forwardToCcr: (workRequestId: string, note?: string) => void;
//   listFinalDocument: (workRequestId: string, payload: { name: string; category: string }) => void;
//   updateSettings: (payload: Partial<PortalSettings>) => void;
// }

// const PortalContext = createContext<PortalContextValue | null>(null);

// const now = () => new Date().toISOString();
// const fmt = (value: string) => new Date(value).toLocaleString();
// const uid = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 8)}`;

// function createSeedAttachment(payload: Omit<AttachmentRef, "id" | "uploadedAt" | "version"> & { uploadedAt?: string; version?: number }): AttachmentRef {
//   return {
//     id: uid("att"),
//     uploadedAt: payload.uploadedAt || now(),
//     version: payload.version || 1,
//     ...payload,
//   };
// }

// function createSeedHistory(action: string, by: string, to?: string, note?: string): HistoryEntry {
//   return {
//     id: uid("hist"),
//     at: now(),
//     by,
//     action,
//     to,
//     note,
//   };
// }

// function createSeedState(): PortalState {
//   const companies: Company[] = [
//     { id: "company-deme", name: "DEME", abbr: "DEME", type: "End Client / Cargo Owner" },
//     { id: "company-hml", name: "HML", abbr: "HML", type: "Portal Owner" },
//     { id: "company-tms", name: "TMS", abbr: "TMS", type: "Technical Management Service" },
//   ];

//   const divisions: Division[] = [
//     { id: "div-ccr", companyId: "company-hml", name: "CCR Division", abbr: "CCR", type: "Marketing Division of HML" },
//     { id: "div-ecm", companyId: "company-hml", name: "ECM Division", abbr: "ECM", type: "Engineering Division of HML" },
//     { id: "div-pmo", companyId: "company-hml", name: "PMO Division", abbr: "PMO", type: "Operation Division of HML" },
//     { id: "div-tms-eng", companyId: "company-tms", name: "TMS-Eng", abbr: "TMS", type: "Drawing / Checking / Approval" },
//     { id: "div-tms-it", companyId: "company-tms", name: "TMS-IT", abbr: "TMS-IT", type: "System / IT Support" },
//   ];

//   const members: Member[] = [
//     { id: "member-prime", name: "Prime Consultant", email: "prime@hml.com", companyId: "company-hml", divisionId: "div-ccr", roleTitle: "Prime Consultant", active: true },
//     { id: "member-ccr-1", name: "Ahmad Rahman", email: "ccr@hml.com", companyId: "company-hml", divisionId: "div-ccr", roleTitle: "CCR Coordinator", active: true },
//     { id: "member-ecm-lead", name: "Dr. Yusof Ismail", email: "ecmlead@hml.com", companyId: "company-hml", divisionId: "div-ecm", roleTitle: "ECM Team Leader", active: true },
//     { id: "member-ecm-1", name: "Lisa Wang", email: "ecm1@hml.com", companyId: "company-hml", divisionId: "div-ecm", roleTitle: "ECM Member", active: true },
//     { id: "member-pmo-lead", name: "PMO Lead", email: "pmolead@hml.com", companyId: "company-hml", divisionId: "div-pmo", roleTitle: "PMO Team Leader", active: true },
//     { id: "member-pmo-1", name: "PMO-M1", email: "pmo1@hml.com", companyId: "company-hml", divisionId: "div-pmo", roleTitle: "PMO Member", active: true },
//     { id: "member-tms-manager", name: "Tan Wei Ming", email: "manager@tms.com", companyId: "company-tms", divisionId: "div-tms-eng", roleTitle: "TMS Manager", active: true },
//     { id: "member-tms-m1", name: "Aisha Binti", email: "drawing@tms.com", companyId: "company-tms", divisionId: "div-tms-eng", roleTitle: "Drawing Member", active: true },
//     { id: "member-tms-m2", name: "Mark Johnson", email: "checking@tms.com", companyId: "company-tms", divisionId: "div-tms-eng", roleTitle: "Checking Member", active: true },
//     { id: "member-tms-m3", name: "Priya Nair", email: "approval@tms.com", companyId: "company-tms", divisionId: "div-tms-eng", roleTitle: "Approval Member", active: true },
//   ];

//   const teams: Team[] = [
//     { id: "team-ccr", name: "CCR Team", companyId: "company-hml", divisionId: "div-ccr", leadMemberId: "member-ccr-1", memberIds: ["member-prime", "member-ccr-1"] },
//     { id: "team-ecm", name: "ECM Team", companyId: "company-hml", divisionId: "div-ecm", leadMemberId: "member-ecm-lead", memberIds: ["member-ecm-lead", "member-ecm-1"] },
//     { id: "team-pmo", name: "PMO Team", companyId: "company-hml", divisionId: "div-pmo", leadMemberId: "member-pmo-lead", memberIds: ["member-pmo-lead", "member-pmo-1"] },
//     { id: "team-tms", name: "TMS Engineering Team", companyId: "company-tms", divisionId: "div-tms-eng", leadMemberId: "member-tms-manager", memberIds: ["member-tms-manager", "member-tms-m1", "member-tms-m2", "member-tms-m3"] },
//   ];

//   const clients: Client[] = [{ id: "client-deme", name: "DEME", email: "projects@deme.com", companyId: "company-deme" }];

//   const actors: Actor[] = [
//     { id: "actor-admin", label: "System Admin", role: "system_admin" },
//     { id: "actor-prime", label: "Prime Consultant", role: "prime_consultant", memberId: "member-prime" },
//     { id: "actor-ccr", label: "CCR Coordinator", role: "ccr_coordinator", memberId: "member-ccr-1" },
//     { id: "actor-ecm-lead", label: "ECM Lead", role: "division_lead", memberId: "member-ecm-lead" },
//     { id: "actor-ecm-m1", label: "ECM-M1", role: "division_member", memberId: "member-ecm-1" },
//     { id: "actor-pmo-lead", label: "PMO Lead", role: "division_lead", memberId: "member-pmo-lead" },
//     { id: "actor-pmo-m1", label: "PMO-M1", role: "division_member", memberId: "member-pmo-1" },
//     { id: "actor-tms-manager", label: "TMS Manager", role: "tms_manager", memberId: "member-tms-manager" },
//     { id: "actor-tms-drawing", label: "TMS-M1", role: "tms_drawing", memberId: "member-tms-m1" },
//     { id: "actor-tms-checking", label: "TMS-M2", role: "tms_checking", memberId: "member-tms-m2" },
//     { id: "actor-tms-approval", label: "TMS-M3", role: "tms_approval", memberId: "member-tms-m3" },
//     { id: "actor-client", label: "Client / Owner (DEME)", role: "client_owner", clientId: "client-deme" },
//   ];

//   const initialDoc = createSeedAttachment({
//     name: "DEME Initial Request.pdf",
//     category: "Client Request",
//     uploadedBy: "Ahmad Rahman",
//     sourceType: "METADATA",
//     fileName: "DEME Initial Request.pdf",
//     fileType: "application/pdf",
//     workflowStage: "Project / Bid Intake",
//     note: "Original client request collected by CCR.",
//   });

//   const transportPlanDoc = createSeedAttachment({
//     name: "Transport Scope Note",
//     category: "General",
//     uploadedBy: "Ahmad Rahman",
//     sourceType: "TEXT",
//     textContent: "Initial transport scope submitted as a text document for intake review.",
//     workflowStage: "Project / Bid Intake",
//   });

//   const project: ProjectItem = {
//     id: "project-bid-26001",
//     code: "BID-26001",
//     name: "DEME Offshore Wind Farm Transport",
//     type: "BID",
//     clientId: "client-deme",
//     clientEmail: "projects@deme.com",
//     originDivisionId: "div-ccr",
//     sourceChannel: "Email Intake",
//     status: "BIDDING",
//     initialDocuments: [initialDoc, transportPlanDoc],
//     credentialsSent: true,
//     createdAt: now(),
//   };

//   const projectTwo: ProjectItem = {
//     id: "project-bid-26002",
//     code: "BID-26002",
//     name: "Subsea Cable Installation Logistics",
//     type: "BID",
//     clientId: "client-deme",
//     clientEmail: "projects@deme.com",
//     originDivisionId: "div-ccr",
//     sourceChannel: "Portal Intake",
//     status: "ACTIVE",
//     initialDocuments: [
//       createSeedAttachment({
//         name: "Cable Installation Brief.docx",
//         category: "Engineering",
//         uploadedBy: "Ahmad Rahman",
//         sourceType: "METADATA",
//         fileName: "Cable Installation Brief.docx",
//         fileType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
//         workflowStage: "Project / Bid Intake",
//       }),
//     ],
//     credentialsSent: true,
//     createdAt: now(),
//   };

//   const projectThree: ProjectItem = {
//     id: "project-bid-26003",
//     code: "BID-26003",
//     name: "Port Equipment Mobilization Plan",
//     type: "BID",
//     clientId: "client-deme",
//     clientEmail: "projects@deme.com",
//     originDivisionId: "div-ccr",
//     sourceChannel: "Email Intake",
//     status: "DRAFT",
//     initialDocuments: [
//       createSeedAttachment({
//         name: "Mobilization Requirement",
//         category: "Port Fee",
//         uploadedBy: "Ahmad Rahman",
//         sourceType: "TEXT",
//         textContent: "Client requested a port equipment mobilization plan with estimated operation windows.",
//         workflowStage: "Project / Bid Intake",
//       }),
//     ],
//     credentialsSent: false,
//     createdAt: now(),
//   };

//   const workRequests: WorkRequest[] = [
//     {
//       id: "wr-26001-001",
//       code: "WR-001",
//       parentType: "BID",
//       parentId: project.id,
//       title: "Stowage Plan",
//       category: "Stowage Plan",
//       priority: "High",
//       attachmentName: initialDoc.name,
//       attachmentCategory: initialDoc.category,
//       notes: "Initial cargo arrangement request from DEME.",
//       assignedDivisionId: "div-ecm",
//       originDivisionId: "div-ecm",
//       currentStatus: "HML_LISTED",
//       assignedLeaderId: "member-ecm-lead",
//       assignedMemberId: "member-ecm-1",
//       tmsAssignments: {
//         managerId: "member-tms-manager",
//         drawingId: "member-tms-m1",
//         checkingId: "member-tms-m2",
//         approvalId: "member-tms-m3",
//       },
//       drawingDocumentName: "Stowage Plan Final Package.pdf",
//       lastTransferredAt: now(),
//       revisionHistory: [
//         createSeedHistory("Created and forwarded to ECM", "Ahmad Rahman", "ECM Lead"),
//         createSeedHistory("Assigned to ECM-M1", "Dr. Yusof Ismail", "Lisa Wang"),
//         createSeedHistory("Forwarded to TMS for execution", "Dr. Yusof Ismail", "Tan Wei Ming"),
//         createSeedHistory("TMS roles assigned: Drawing=Aisha Binti, Checking=Mark Johnson, Approval=Priya Nair", "Tan Wei Ming", "TMS Workflow"),
//         createSeedHistory("Drawing submitted for checking", "Aisha Binti", "Mark Johnson", "Submitted drawing output for checking."),
//         createSeedHistory("Checking approved, forwarded to approval", "Mark Johnson", "Priya Nair", "Checked package is acceptable."),
//         createSeedHistory("TMS approved, returned to ECM", "Priya Nair", "Lisa Wang", "Approved package returned to ECM."),
//         createSeedHistory("Final document Stowage Plan Final Package.pdf listed in HML registry", "Ahmad Rahman", "HML Document List"),
//       ],
//     },
//     {
//       id: "wr-26001-002",
//       code: "WR-002",
//       parentType: "BID",
//       parentId: project.id,
//       title: "Voyage Condition Report",
//       category: "Voyage Condition",
//       priority: "Medium",
//       attachmentName: "Voyage condition reference",
//       attachmentCategory: "Voyage Condition",
//       notes: "Prepare voyage condition report for client review.",
//       assignedDivisionId: "div-ecm",
//       originDivisionId: "div-ecm",
//       currentStatus: "FORWARDED_TO_TMS",
//       assignedLeaderId: "member-ecm-lead",
//       assignedMemberId: "member-ecm-1",
//       lastTransferredAt: now(),
//       revisionHistory: [
//         createSeedHistory("Created and forwarded to ECM", "Ahmad Rahman", "ECM Lead"),
//         createSeedHistory("Assigned to ECM-M1", "Dr. Yusof Ismail", "Lisa Wang"),
//         createSeedHistory("Forwarded to TMS for execution", "Lisa Wang", "Tan Wei Ming"),
//       ],
//     },
//     {
//       id: "wr-26001-003",
//       code: "WR-003",
//       parentType: "BID",
//       parentId: project.id,
//       title: "Port Fee Calculation",
//       category: "Port Fee",
//       priority: "Low",
//       attachmentName: "Port fee data",
//       attachmentCategory: "Port Fee",
//       notes: "Calculate port fee based on the current port schedule.",
//       assignedDivisionId: "div-pmo",
//       originDivisionId: "div-pmo",
//       currentStatus: "FORWARDED_TO_CCR",
//       assignedLeaderId: "member-pmo-lead",
//       assignedMemberId: "member-pmo-1",
//       lastTransferredAt: now(),
//       revisionHistory: [
//         createSeedHistory("Created and forwarded to PMO", "Ahmad Rahman", "PMO Lead"),
//         createSeedHistory("PMO completed calculation", "PMO-M1", "PMO Lead"),
//         createSeedHistory("Division manager forwarded the package to CCR for final listing", "PMO Lead", "CCR"),
//       ],
//     },
//   ];

//   return {
//     companies,
//     divisions,
//     teams,
//     members,
//     clients,
//     actors,
//     currentActorId: "actor-prime",
//     projects: [project, projectTwo, projectThree],
//     workRequests,
//     documents: [
//       {
//         id: "doc-stowage-final",
//         projectId: project.id,
//         workRequestId: "wr-26001-001",
//         name: "Stowage Plan Final Package.pdf",
//         category: "Stowage Plan",
//         divisionId: "div-ecm",
//         listedAt: now(),
//         listedBy: "Ahmad Rahman",
//       },
//     ],
//     settings: { portalName: "Project Management Portal", categories: ["Client Request", "Stowage Plan", "Voyage Condition", "Port Fee", "Engineering", "General"] },
//   };
// }

// const STORAGE_KEY = "project-portal-state-v4";

// function clone<T>(value: T): T {
//   return JSON.parse(JSON.stringify(value)) as T;
// }

// function resolveAttachmentSourceType(payload: AttachmentInput): AttachmentSourceType {
//   const hasText = Boolean(payload.textContent?.trim());
//   const hasFile = Boolean(payload.fileDataUrl || payload.fileName);

//   if (hasText && hasFile) return "TEXT_AND_FILE";
//   if (hasText) return "TEXT";
//   if (hasFile) return "FILE";
//   return "METADATA";
// }

// function normalizeAttachmentKey(value?: string) {
//   return (value || "").trim().toLowerCase();
// }

// function getAttachmentKeyFromInput(payload: AttachmentInput) {
//   return normalizeAttachmentKey(payload.fileName || payload.name);
// }

// function getAttachmentKeyFromRef(attachment: AttachmentRef) {
//   return normalizeAttachmentKey(attachment.fileName || attachment.name);
// }

// function getAutoAttachmentName(payload: AttachmentInput) {
//   if (payload.fileName?.trim()) return payload.fileName.trim();
//   if (payload.name?.trim()) return payload.name.trim();

//   if (payload.textContent?.trim()) {
//     return `Text Document - ${new Date().toISOString().slice(0, 19).replace("T", " ")}`;
//   }

//   return "Untitled document";
// }

// function getNextAttachmentVersion(existingAttachments: AttachmentRef[], payload: AttachmentInput) {
//   const key = getAttachmentKeyFromInput({
//     ...payload,
//     name: getAutoAttachmentName(payload),
//   });

//   if (!key) return 1;

//   const matchingVersions = existingAttachments
//     .filter((attachment) => getAttachmentKeyFromRef(attachment) === key)
//     .map((attachment) => attachment.version || 1);

//   if (!matchingVersions.length) return 1;
//   return Math.max(...matchingVersions) + 1;
// }

// function createAttachment(payload: AttachmentInput, uploadedBy: string, existingAttachments: AttachmentRef[] = []): AttachmentRef {
//   const autoName = getAutoAttachmentName(payload);
//   const nextVersion = getNextAttachmentVersion(existingAttachments, { ...payload, name: autoName });

//   return {
//     id: uid("att"),
//     name: autoName,
//     category: payload.category,
//     uploadedBy,
//     uploadedAt: now(),
//     sourceType: resolveAttachmentSourceType(payload),
//     textContent: payload.textContent?.trim() || undefined,
//     fileName: payload.fileName?.trim() || undefined,
//     fileType: payload.fileType || undefined,
//     fileSize: payload.fileSize || undefined,
//     fileDataUrl: payload.fileDataUrl || undefined,
//     workflowStage: payload.workflowStage || "Project / Bid Intake",
//     note: payload.note?.trim() || undefined,
//     version: nextVersion,
//   };
// }

// export function PortalDataProvider({ children }: { children: React.ReactNode }) {
//   const [state, setState] = useState<PortalState>(() => {
//     if (typeof window === "undefined") return createSeedState();

//     const stored = window.localStorage.getItem(STORAGE_KEY);
//     if (!stored) return createSeedState();

//     try {
//       return JSON.parse(stored) as PortalState;
//     } catch {
//       return createSeedState();
//     }
//   });

//   useEffect(() => {
//     if (typeof window !== "undefined") {
//       window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
//     }
//   }, [state]);

//   const currentActor = useMemo(
//     () => state.actors.find((actor) => actor.id === state.currentActorId) || state.actors[0],
//     [state.actors, state.currentActorId]
//   );

//   const actorLabel = useCallback(() => currentActor.label, [currentActor.label]);
//   const memberName = useCallback((memberId?: string) => state.members.find((m) => m.id === memberId)?.name || "Unknown", [state.members]);
//   const divisionName = useCallback((divisionId?: string) => state.divisions.find((d) => d.id === divisionId)?.abbr || "Unknown", [state.divisions]);

//   const setCurrentActorId = useCallback((id: string) => {
//     setState((prev) => ({ ...prev, currentActorId: id }));
//   }, []);

//   const addCompany = useCallback((payload: { name: string; abbr: string; type: string }) => {
//     setState((prev) => ({ ...prev, companies: [...prev.companies, { id: uid("company"), ...payload }] }));
//   }, []);

//   const addDivision = useCallback((payload: { companyId: string; name: string; abbr: string; type: string }) => {
//     setState((prev) => ({ ...prev, divisions: [...prev.divisions, { id: uid("division"), ...payload }] }));
//   }, []);

//   const addTeam = useCallback((payload: { name: string; companyId: string; divisionId: string; leadMemberId?: string }) => {
//     setState((prev) => ({ ...prev, teams: [...prev.teams, { id: uid("team"), ...payload, memberIds: payload.leadMemberId ? [payload.leadMemberId] : [] }] }));
//   }, []);

//   const addMember = useCallback((payload: { name: string; email: string; companyId: string; divisionId: string; teamId?: string; roleTitle: string }) => {
//     const memberId = uid("member");

//     setState((prev) => {
//       const next = clone(prev);
//       next.members.push({ id: memberId, active: true, ...payload });

//       if (payload.teamId) {
//         const team = next.teams.find((teamItem) => teamItem.id === payload.teamId);
//         if (team && !team.memberIds.includes(memberId)) team.memberIds.push(memberId);
//       }

//       return next;
//     });
//   }, []);

//   const addProject = useCallback((payload: { name: string; type: "BID" | "PROJECT"; clientId: string; sourceChannel: string; initialDocuments: AttachmentInput[] }) => {
//     const client = state.clients.find((item) => item.id === payload.clientId);
//     const count = state.projects.length + 1;
//     const code = payload.type === "BID" ? `BID-${26000 + count}` : `PRJ-${26000 + count}`;

//     const initialDocuments: AttachmentRef[] = [];
//     payload.initialDocuments.forEach((doc) => {
//       initialDocuments.push(createAttachment({ ...doc, workflowStage: doc.workflowStage || "Project / Bid Intake" }, actorLabel(), initialDocuments));
//     });

//     const project: ProjectItem = {
//       id: uid("project"),
//       code,
//       name: payload.name,
//       type: payload.type,
//       clientId: payload.clientId,
//       clientEmail: client?.email || "",
//       originDivisionId: "div-ccr",
//       sourceChannel: payload.sourceChannel,
//       status: payload.type === "BID" ? "BIDDING" : "ACTIVE",
//       initialDocuments,
//       credentialsSent: true,
//       createdAt: now(),
//     };

//     setState((prev) => ({ ...prev, projects: [project, ...prev.projects] }));
//     return project;
//   }, [actorLabel, state.clients, state.projects.length]);

//   const addClientDocument = useCallback((projectId: string, payload: AttachmentInput) => {
//     setState((prev) => ({
//       ...prev,
//       projects: prev.projects.map((project) =>
//         project.id === projectId
//           ? {
//               ...project,
//               initialDocuments: [
//                 ...project.initialDocuments,
//                 createAttachment({ ...payload, workflowStage: payload.workflowStage || "Workflow Collaboration" }, actorLabel(), project.initialDocuments),
//               ],
//             }
//           : project
//       ),
//     }));
//   }, [actorLabel]);

//   const addWorkRequestDocument = useCallback((workRequestId: string, payload: AttachmentInput) => {
//     setState((prev) => {
//       const next = clone(prev);
//       const request = next.workRequests.find((item) => item.id === workRequestId);
//       if (!request) return prev;

//       const project = next.projects.find((item) => item.id === request.parentId);
//       if (!project) return prev;

//       const attachment = createAttachment(
//         { ...payload, workflowStage: payload.workflowStage || getWorkRequestStatusLabel(request.currentStatus) },
//         actorLabel(),
//         project.initialDocuments
//       );

//       project.initialDocuments.push(attachment);
//       request.revisionHistory.unshift({
//         id: uid("hist"),
//         at: now(),
//         by: actorLabel(),
//         action: `Uploaded document ${attachment.name} v${attachment.version || 1}`,
//         to: attachment.workflowStage,
//         note: attachment.note,
//       });
//       request.lastTransferredAt = now();

//       return next;
//     });
//   }, [actorLabel]);

//   const addWorkRequest = useCallback((payload: {
//     parentType: "BID" | "PROJECT";
//     parentId: string;
//     title: string;
//     category: string;
//     priority: "High" | "Medium" | "Low";
//     attachmentName: string;
//     attachmentCategory: string;
//     notes: string;
//     assignedDivisionId: string;
//   }) => {
//     setState((prev) => {
//       const parent = prev.projects.find((project) => project.id === payload.parentId);
//       if (!parent) return prev;

//       const next = clone(prev);

//       const workRequest: WorkRequest = {
//         id: uid("wr"),
//         code: `WR-${String(next.workRequests.length + 1).padStart(3, "0")}`,
//         parentType: payload.parentType,
//         parentId: payload.parentId,
//         title: payload.title,
//         category: payload.category,
//         priority: payload.priority,
//         attachmentName: payload.attachmentName,
//         attachmentCategory: payload.attachmentCategory,
//         notes: payload.notes,
//         assignedDivisionId: payload.assignedDivisionId,
//         originDivisionId: payload.assignedDivisionId,
//         currentStatus: "DIVISION_NOTIFIED",
//         lastTransferredAt: now(),
//         revisionHistory: [
//           {
//             id: uid("hist"),
//             at: now(),
//             by: actorLabel(),
//             action: `${payload.title} created under ${parent.code} and assigned to ${divisionName(payload.assignedDivisionId)}.`,
//             to: divisionName(payload.assignedDivisionId),
//           },
//         ],
//       };

//       next.workRequests.unshift(workRequest);
//       return next;
//     });
//   }, [actorLabel, divisionName]);

//   const updateRequest = useCallback((workRequestId: string, updater: (request: WorkRequest) => void) => {
//     setState((prev) => {
//       const next = clone(prev);
//       const request = next.workRequests.find((item) => item.id === workRequestId);
//       if (!request) return prev;

//       updater(request);
//       return next;
//     });
//   }, []);

//   const pushHistory = useCallback((request: WorkRequest, entry: Omit<HistoryEntry, "id" | "at">) => {
//     request.revisionHistory.unshift({ id: uid("hist"), at: now(), ...entry });
//     request.lastTransferredAt = now();
//   }, []);

//   const assignLeader = useCallback((workRequestId: string, leaderId: string) => {
//     updateRequest(workRequestId, (request) => {
//       request.assignedLeaderId = leaderId;
//       request.currentStatus = "LEADER_ASSIGNED";
//       pushHistory(request, {
//         by: actorLabel(),
//         action: `${memberName(leaderId)} assigned as division lead.`,
//         to: memberName(leaderId),
//       });
//     });
//   }, [actorLabel, memberName, pushHistory, updateRequest]);

//   const assignMember = useCallback((workRequestId: string, memberId: string) => {
//     updateRequest(workRequestId, (request) => {
//       request.assignedMemberId = memberId;
//       request.currentStatus = "MEMBER_REVIEW";
//       pushHistory(request, {
//         by: actorLabel(),
//         action: `${memberName(memberId)} assigned for review and forwarding.`,
//         to: memberName(memberId),
//       });
//     });
//   }, [actorLabel, memberName, pushHistory, updateRequest]);

//   const forwardToTms = useCallback((workRequestId: string, note?: string) => {
//     updateRequest(workRequestId, (request) => {
//       request.currentStatus = "FORWARDED_TO_TMS";
//       pushHistory(request, {
//         by: actorLabel(),
//         action: `Forwarded from ${divisionName(request.originDivisionId)} to TMS.`,
//         from: divisionName(request.originDivisionId),
//         to: "TMS",
//         note,
//       });
//     });
//   }, [actorLabel, divisionName, pushHistory, updateRequest]);

//   const assignTmsChain = useCallback((workRequestId: string, payload: { drawingId: string; checkingId: string; approvalId: string }) => {
//     updateRequest(workRequestId, (request) => {
//       request.tmsAssignments = {
//         managerId: currentActor.memberId,
//         drawingId: payload.drawingId,
//         checkingId: payload.checkingId,
//         approvalId: payload.approvalId,
//       };
//       request.currentStatus = "TMS_ASSIGNED";
//       pushHistory(request, {
//         by: actorLabel(),
//         action: `TMS chain assigned: Drawing ${memberName(payload.drawingId)}, Checking ${memberName(payload.checkingId)}, Approval ${memberName(payload.approvalId)}.`,
//         to: "TMS Workflow",
//       });
//     });
//   }, [actorLabel, currentActor.memberId, memberName, pushHistory, updateRequest]);

//   const submitDrawing = useCallback((workRequestId: string, documentName: string) => {
//     updateRequest(workRequestId, (request) => {
//       request.drawingDocumentName = documentName;
//       request.currentStatus = "CHECKING_REVIEW";
//       pushHistory(request, {
//         by: actorLabel(),
//         action: `Drawing submitted to checking stage as ${documentName}.`,
//         to: memberName(request.tmsAssignments?.checkingId),
//       });
//     });
//   }, [actorLabel, memberName, pushHistory, updateRequest]);

//   const reviewChecking = useCallback((workRequestId: string, approved: boolean, note?: string) => {
//     updateRequest(workRequestId, (request) => {
//       if (approved) {
//         request.currentStatus = "APPROVAL_REVIEW";
//         pushHistory(request, { by: actorLabel(), action: "Checking completed and forwarded to approval.", to: memberName(request.tmsAssignments?.approvalId), note });
//       } else {
//         request.currentStatus = "DRAWING_IN_PROGRESS";
//         pushHistory(request, { by: actorLabel(), action: "Checking rejected and returned to drawing stage.", to: memberName(request.tmsAssignments?.drawingId), note });
//       }
//     });
//   }, [actorLabel, memberName, pushHistory, updateRequest]);

//   const reviewApproval = useCallback((workRequestId: string, approved: boolean, note?: string) => {
//     updateRequest(workRequestId, (request) => {
//       if (approved) {
//         request.currentStatus = "RETURNED_TO_DIVISION";
//         pushHistory(request, { by: actorLabel(), action: `TMS approval complete and returned to ${divisionName(request.originDivisionId)}.`, to: divisionName(request.originDivisionId), note });
//       } else {
//         request.currentStatus = "DRAWING_IN_PROGRESS";
//         pushHistory(request, { by: actorLabel(), action: "Approval rejected and returned to drawing stage.", to: memberName(request.tmsAssignments?.drawingId), note });
//       }
//     });
//   }, [actorLabel, divisionName, memberName, pushHistory, updateRequest]);

//   const originMemberDecision = useCallback((workRequestId: string, approved: boolean, note?: string) => {
//     updateRequest(workRequestId, (request) => {
//       if (approved) {
//         request.currentStatus = "DIVISION_MEMBER_APPROVED";
//         pushHistory(request, { by: actorLabel(), action: `${divisionName(request.originDivisionId)} member approved the returned package.`, note });
//       } else {
//         request.currentStatus = "FORWARDED_TO_TMS";
//         pushHistory(request, { by: actorLabel(), action: `${divisionName(request.originDivisionId)} member rejected and returned package back to TMS.`, to: "TMS", note });
//       }
//     });
//   }, [actorLabel, divisionName, pushHistory, updateRequest]);

//   const originManagerApprove = useCallback((workRequestId: string, note?: string) => {
//     updateRequest(workRequestId, (request) => {
//       request.currentStatus = "DIVISION_MANAGER_APPROVED";
//       pushHistory(request, { by: actorLabel(), action: `${divisionName(request.originDivisionId)} manager approved the package.`, note });
//     });
//   }, [actorLabel, divisionName, pushHistory, updateRequest]);

//   const forwardToCcr = useCallback((workRequestId: string, note?: string) => {
//     updateRequest(workRequestId, (request) => {
//       request.currentStatus = "FORWARDED_TO_CCR";
//       pushHistory(request, { by: actorLabel(), action: "Division manager forwarded the package to CCR for final listing.", to: "CCR", note });
//     });
//   }, [actorLabel, pushHistory, updateRequest]);

//   const listFinalDocument = useCallback((workRequestId: string, payload: { name: string; category: string }) => {
//   setState((prev) => {
//     const next = clone(prev);
//     const request = next.workRequests.find((item) => item.id === workRequestId);
//     if (!request) return prev;

//     request.currentStatus = "HML_LISTED";
//     request.lastTransferredAt = now();
//     request.revisionHistory.unshift({
//       id: uid("hist"),
//       at: now(),
//       by: actorLabel(),
//       action: `Final document ${payload.name} listed in HML registry.`,
//       to: "HML Document List",
//     });

//     next.documents.unshift({
//       id: uid("doc"),
//       projectId: request.parentId,
//       workRequestId,
//       name: payload.name,
//       category: payload.category,
//       divisionId: request.originDivisionId,
//       listedAt: now(),
//       listedBy: actorLabel(),
//     });

//     const parentProject = next.projects.find((project) => project.id === request.parentId);

//     if (parentProject?.type === "BID") {
//       const relatedRequests = next.workRequests.filter((workRequest) => workRequest.parentId === parentProject.id);
//       const allRelatedRequestsCompleted =
//         relatedRequests.length > 0 && relatedRequests.every((workRequest) => workRequest.currentStatus === "HML_LISTED");

//       if (allRelatedRequestsCompleted) {
//         const nextProjectCount = next.projects.filter((project) => project.type === "PROJECT").length + 1;

//         parentProject.type = "PROJECT";
//         parentProject.status = "ACTIVE";
//         parentProject.code = `PRJ-${26000 + nextProjectCount}`;
//       }
//     }

//     return next;
//   });
// }, [actorLabel]);

//   const updateSettings = useCallback((payload: Partial<PortalSettings>) => {
//     setState((prev) => ({ ...prev, settings: { ...prev.settings, ...payload } }));
//   }, []);

//   const value = useMemo<PortalContextValue>(() => ({
//     state,
//     currentActor,
//     setCurrentActorId,
//     addCompany,
//     addDivision,
//     addTeam,
//     addMember,
//     addProject,
//     addClientDocument,
//     addWorkRequestDocument,
//     addWorkRequest,
//     assignLeader,
//     assignMember,
//     forwardToTms,
//     assignTmsChain,
//     submitDrawing,
//     reviewChecking,
//     reviewApproval,
//     originMemberDecision,
//     originManagerApprove,
//     forwardToCcr,
//     listFinalDocument,
//     updateSettings,
//   }), [
//     state,
//     currentActor,
//     setCurrentActorId,
//     addCompany,
//     addDivision,
//     addTeam,
//     addMember,
//     addProject,
//     addClientDocument,
//     addWorkRequestDocument,
//     addWorkRequest,
//     assignLeader,
//     assignMember,
//     forwardToTms,
//     assignTmsChain,
//     submitDrawing,
//     reviewChecking,
//     reviewApproval,
//     originMemberDecision,
//     originManagerApprove,
//     forwardToCcr,
//     listFinalDocument,
//     updateSettings,
//   ]);

//   return <PortalContext.Provider value={value}>{children}</PortalContext.Provider>;
// }

// export function usePortal() {
//   const ctx = useContext(PortalContext);
//   if (!ctx) throw new Error("usePortal must be used within PortalDataProvider");
//   return ctx;
// }

// export function getProjectLabel(project: ProjectItem) {
//   return `${project.code} — ${project.name}`;
// }

// export function getWorkRequestStatusLabel(status: WorkRequestStatus) {
//   return {
//     CREATED: "Created",
//     DIVISION_NOTIFIED: "Division Notified",
//     LEADER_ASSIGNED: "Leader Assigned",
//     MEMBER_REVIEW: "Member Review",
//     FORWARDED_TO_TMS: "Forwarded to TMS",
//     TMS_ASSIGNED: "TMS Assigned",
//     DRAWING_IN_PROGRESS: "Drawing In Progress",
//     CHECKING_REVIEW: "Checking Review",
//     APPROVAL_REVIEW: "Approval Review",
//     RETURNED_TO_DIVISION: "Returned to Division",
//     DIVISION_MEMBER_APPROVED: "Division Member Approved",
//     DIVISION_MANAGER_APPROVED: "Division Manager Approved",
//     FORWARDED_TO_CCR: "Forwarded to CCR",
//     HML_LISTED: "Listed in HML",
//     REJECTED: "Rejected",
//   }[status];
// }

// export function statusToSimple(status: WorkRequestStatus): "pending" | "active" | "in-progress" | "completed" | "rejected" | "draft" {
//   if (["HML_LISTED"].includes(status)) return "completed";
//   if (["REJECTED"].includes(status)) return "rejected";
//   if (["CREATED"].includes(status)) return "draft";
//   if (["DIVISION_NOTIFIED", "LEADER_ASSIGNED", "MEMBER_REVIEW", "FORWARDED_TO_TMS", "TMS_ASSIGNED", "DRAWING_IN_PROGRESS", "CHECKING_REVIEW", "APPROVAL_REVIEW", "RETURNED_TO_DIVISION", "DIVISION_MEMBER_APPROVED", "DIVISION_MANAGER_APPROVED", "FORWARDED_TO_CCR"].includes(status)) return "active";
//   return "pending";
// }

// export function actorCanManageProjects(role: ActorRole) {
//   return ["system_admin", "prime_consultant", "ccr_coordinator"].includes(role);
// }

// export function actorCanCreateWorkRequests(role: ActorRole) {
//   return ["system_admin", "prime_consultant", "ccr_coordinator"].includes(role);
// }

// export function belongsToDivision(member: Member | undefined, divisionId: string) {
//   return member?.divisionId === divisionId;
// }

// export function formatDate(value: string) {
//   return fmt(value);
// }