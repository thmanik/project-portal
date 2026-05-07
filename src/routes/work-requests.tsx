import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { WorkflowTimeline } from "@/components/WorkflowTimeline";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  actorCanCreateWorkRequests,
  formatDate,
  getProjectLabel,
  getWorkRequestStatusLabel,
  statusToSimple,
  type AttachmentInput,
  type AttachmentRef,
  type Member,
  type WorkRequest,
  type WorkRequestStatus,
  usePortal,
} from "@/lib/portal-data";
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  Eye,
  FileText,
  GitMerge,
  History,
  Paperclip,
  Plus,
  Search,
  Send,
  Upload,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

type WorkRequestSearch = {
  requestId?: string;
  view?: "details" | "history" | "upload" | "action" | "focus";
};

export const Route = createFileRoute("/work-requests")({
  validateSearch: (search: Record<string, unknown>): WorkRequestSearch => ({
    requestId: typeof search.requestId === "string" ? search.requestId : undefined,
    view:
      search.view === "details" ||
      search.view === "history" ||
      search.view === "upload" ||
      search.view === "action" ||
      search.view === "focus"
        ? search.view
        : undefined,
  }),
  component: WorkRequestsPage,
  head: () => ({
    meta: [{ title: "Work Requests — Project Portal" }],
  }),
});

type DocumentFormRow = AttachmentInput;

type WorkflowAction =
  | "ASSIGN_LEADER"
  | "ASSIGN_MEMBER"
  | "FORWARD_TO_TMS"
  | "ASSIGN_TMS_CHAIN"
  | "SUBMIT_DRAWING"
  | "CHECKING_APPROVE_REJECT"
  | "APPROVAL_APPROVE_REJECT"
  | "DIVISION_MEMBER_REVIEW"
  | "DIVISION_MANAGER_APPROVE"
  | "FORWARD_TO_CCR"
  | "FINAL_LIST"
  | "SEND_BACKWARD";

type FileGroup = "PRIMARY" | "WORKFLOW";

const workflowUploadStages = [
  "Work Request Creation",
  "ECM / PMO Review",
  "TMS Manager Assignment",
  "TMS Drawing - M1",
  "TMS Checking - M2",
  "TMS Approval - M3",
  "Division Final Review",
  "CCR Closeout",
  "HML Registry",
  "Workflow Collaboration",
];

function createEmptyDocumentRow(category = "General", workflowStage = "Workflow Collaboration"): DocumentFormRow {
  return {
    name: "",
    category,
    textContent: "",
    workflowStage,
    note: "",
  };
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Unable to read file"));
    reader.readAsDataURL(file);
  });
}

function formatFileSize(size?: number) {
  if (!size) return "Unknown size";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function autoDocumentName(doc: DocumentFormRow) {
  if (doc.fileName?.trim()) return doc.fileName.trim();
  if (doc.name?.trim()) return doc.name.trim();

  if (doc.textContent?.trim()) {
    return `Text Document - ${new Date().toISOString().slice(0, 19).replace("T", " ")}`;
  }

  return "";
}

function normalizeDocument(doc: DocumentFormRow) {
  const normalizedName = autoDocumentName(doc);

  const normalized = {
    ...doc,
    name: normalizedName,
    textContent: doc.textContent?.trim() || undefined,
    note: doc.note?.trim() || undefined,
  };

  if (!normalized.textContent && !normalized.fileDataUrl && !normalized.fileName) return null;
  return normalized;
}

function safeFileName(name: string) {
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").trim() || "document";
}

function ensureTxtExtension(name: string) {
  return /\.[a-z0-9]+$/i.test(name) ? name : `${name}.txt`;
}

function getFileExtension(fileName?: string) {
  if (!fileName) return "";
  const cleanName = fileName.split("?")[0].split("#")[0];
  const parts = cleanName.split(".");
  if (parts.length < 2) return "";
  return parts.pop()?.trim().toLowerCase() || "";
}

function getFileTypeKey(doc: AttachmentRef) {
  const extension = getFileExtension(doc.fileName || doc.name);

  if (extension) return extension;

  if (doc.fileType?.includes("/")) {
    const subtype = doc.fileType.split("/")[1]?.toLowerCase() || "";
    return subtype.split(";")[0].split("+")[0] || "unknown";
  }

  if (doc.textContent && !doc.fileName) return "txt";

  return "unknown";
}

function getFileTypeLabel(type: string) {
  if (!type || type === "unknown") return "Unknown";
  return type.toUpperCase();
}

function getUploadedDateKey(uploadedAt?: string) {
  if (!uploadedAt) return "";

  if (/^\d{4}-\d{2}-\d{2}/.test(uploadedAt)) {
    return uploadedAt.slice(0, 10);
  }

  const parsed = new Date(uploadedAt);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function isImageFile(doc: AttachmentRef) {
  const type = doc.fileType?.toLowerCase() || "";
  const ext = getFileTypeKey(doc);
  return type.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext);
}

function isPdfFile(doc: AttachmentRef) {
  const type = doc.fileType?.toLowerCase() || "";
  const ext = getFileTypeKey(doc);
  return type === "application/pdf" || ext === "pdf";
}

function filterAttachmentFiles(files: AttachmentRef[], search: string, fileType: string, uploadDate: string) {
  const normalizedSearch = search.trim().toLowerCase();

  return files.filter((doc) => {
    const fileName = `${doc.fileName || ""} ${doc.name || ""}`.toLowerCase();
    const matchesSearch = !normalizedSearch || fileName.includes(normalizedSearch);
    const matchesType = fileType === "ALL" || getFileTypeKey(doc) === fileType;
    const matchesDate = !uploadDate || getUploadedDateKey(doc.uploadedAt) === uploadDate;

    return matchesSearch && matchesType && matchesDate;
  });
}

async function downloadAttachment(doc: AttachmentRef) {
  if (typeof window === "undefined") return;

  if (doc.fileDataUrl) {
    try {
      const response = await fetch(doc.fileDataUrl);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = objectUrl;
      link.download = safeFileName(doc.fileName || doc.name || "download");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(objectUrl);
      return;
    } catch {
      const link = document.createElement("a");
      link.href = doc.fileDataUrl;
      link.download = safeFileName(doc.fileName || doc.name || "download");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }
  }

  const fallbackText = doc.textContent?.trim()
    ? doc.textContent
    : [
        `Document: ${doc.name}`,
        `Category: ${doc.category}`,
        `Workflow Stage: ${doc.workflowStage || "Workflow Collaboration"}`,
        `Uploaded By: ${doc.uploadedBy}`,
        `Uploaded At: ${formatDate(doc.uploadedAt)}`,
        "",
        doc.note || "Original file body is not available for this old/demo document because only metadata was stored.",
      ].join("\n");

  const blob = new Blob([fallbackText], { type: "text/plain;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = objectUrl;
  link.download = ensureTxtExtension(safeFileName(doc.name || "document"));
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(objectUrl);
}

function getAttachmentFileGroup(doc: AttachmentRef): FileGroup {
  const fileGroup = (doc as AttachmentRef & { fileGroup?: FileGroup }).fileGroup;
  return fileGroup || "PRIMARY";
}

function priorityClass(priority: WorkRequest["priority"]) {
  if (priority === "High") return "text-rose-600";
  if (priority === "Medium") return "text-orange-600";
  return "text-slate-600 dark:text-slate-300";
}

function requestStageLabel(status: WorkRequestStatus) {
  if (status === "HML_LISTED") return "Listed";
  if (["FORWARDED_TO_TMS", "TMS_ASSIGNED", "DRAWING_IN_PROGRESS", "CHECKING_REVIEW", "APPROVAL_REVIEW"].includes(status)) return "At TMS";
  if (status === "RETURNED_TO_DIVISION") return "Returned";
  if (status === "FORWARDED_TO_CCR") return "At CCR";
  if (status === "DIVISION_MEMBER_APPROVED" || status === "DIVISION_MANAGER_APPROVED") return "Div Review";
  return "Assigned";
}

function workflowStepIndex(status: WorkRequestStatus) {
  if (status === "CREATED") return 0;
  if (status === "DIVISION_NOTIFIED") return 1;
  if (status === "LEADER_ASSIGNED") return 2;
  if (status === "MEMBER_REVIEW") return 3;
  if (status === "FORWARDED_TO_TMS") return 4;
  if (status === "TMS_ASSIGNED") return 5;
  if (status === "DRAWING_IN_PROGRESS") return 6;
  if (status === "CHECKING_REVIEW") return 7;
  if (status === "APPROVAL_REVIEW") return 8;
  if (status === "RETURNED_TO_DIVISION") return 9;
  if (status === "DIVISION_MEMBER_APPROVED") return 10;
  if (status === "DIVISION_MANAGER_APPROVED") return 11;
  if (status === "FORWARDED_TO_CCR") return 12;
  if (status === "HML_LISTED") return 13;
  return 0;
}

function getWorkflowSteps(request: WorkRequest, divisionAbbr = "ECM") {
  const idx = workflowStepIndex(request.currentStatus);

  const allSteps = [
    { label: "CCR Created", department: "CCR" },
    { label: `${divisionAbbr} Notified`, department: divisionAbbr },
    { label: `${divisionAbbr} Lead Assigned`, department: divisionAbbr },
    { label: `${divisionAbbr} Member Review`, department: divisionAbbr },
    { label: "TMS Manager Intake", department: "TMS" },
    { label: "TMS Chain Assigned", department: "TMS Manager" },
    { label: "TMS-M1 Drawing", department: "M1" },
    { label: "TMS-M2 Checking", department: "M2" },
    { label: "TMS-M3 Approval", department: "M3" },
    { label: `${divisionAbbr} Member Final`, department: divisionAbbr },
    { label: `${divisionAbbr} Lead Approval`, department: divisionAbbr },
    { label: `${divisionAbbr} Forward CCR`, department: divisionAbbr },
    { label: "CCR Final Listing", department: "CCR" },
    { label: "HML Listed", department: "HML" },
  ];

  return allSteps.map((step, stepIdx) => ({
    label: step.label,
    department: step.department,
    status:
      request.currentStatus === "HML_LISTED" || stepIdx < idx
        ? ("completed" as const)
        : stepIdx === idx
          ? ("active" as const)
          : ("pending" as const),
  }));
}

function getDefaultActionUploadStage(status: WorkRequestStatus) {
  if (status === "FORWARDED_TO_TMS") return "TMS Manager Assignment";
  if (status === "TMS_ASSIGNED" || status === "DRAWING_IN_PROGRESS") return "TMS Drawing - M1";
  if (status === "CHECKING_REVIEW") return "TMS Checking - M2";
  if (status === "APPROVAL_REVIEW") return "TMS Approval - M3";
  if (status === "RETURNED_TO_DIVISION" || status === "DIVISION_MEMBER_APPROVED" || status === "DIVISION_MANAGER_APPROVED") return "Division Final Review";
  if (status === "FORWARDED_TO_CCR") return "CCR Closeout";
  if (status === "HML_LISTED") return "HML Registry";
  return "Workflow Collaboration";
}

function getBackwardTargetLabel(status: WorkRequestStatus) {
  const map: Partial<Record<WorkRequestStatus, string>> = {
    LEADER_ASSIGNED: "Division Notified",
    MEMBER_REVIEW: "Division Lead Assignment",
    FORWARDED_TO_TMS: "Division Member Review",
    TMS_ASSIGNED: "TMS Manager Intake",
    DRAWING_IN_PROGRESS: "TMS Chain Assignment",
    CHECKING_REVIEW: "TMS-M1 Drawing Rework",
    APPROVAL_REVIEW: "TMS-M2 Checking Rework",
    RETURNED_TO_DIVISION: "TMS-M3 Approval Rework",
    DIVISION_MEMBER_APPROVED: "Division Member Final Review",
    DIVISION_MANAGER_APPROVED: "Division Member Approved Stage",
    FORWARDED_TO_CCR: "Division Manager Approval",
  };

  return map[status];
}

function shouldShowGenericBackward(status: WorkRequestStatus) {
  return !["CHECKING_REVIEW", "APPROVAL_REVIEW", "RETURNED_TO_DIVISION"].includes(status);
}

function getDocumentRevisionGroups(files: AttachmentRef[]) {
  const groups = new Map<string, AttachmentRef[]>();

  files.forEach((file) => {
    const key = (file.fileName || file.name || "Untitled document").trim().toLowerCase();
    const displayKey = key || file.id;
    const existing = groups.get(displayKey) || [];
    existing.push(file);
    groups.set(displayKey, existing);
  });

  return [...groups.entries()]
    .map(([key, items]) => ({
      key,
      name: items[0]?.fileName || items[0]?.name || "Untitled document",
      revisions: items.sort((a, b) => (a.version || 1) - (b.version || 1)),
      latestAt: items.reduce((latest, item) => (item.uploadedAt > latest ? item.uploadedAt : latest), items[0]?.uploadedAt || ""),
    }))
    .sort((a, b) => b.latestAt.localeCompare(a.latestAt));
}

function WorkRequestsPage() {
  const routeSearch = Route.useSearch();
  const appliedNotificationRouteRef = useRef("");

  const {
    state,
    currentActor,
    addWorkRequest,
    addWorkRequestDocument,
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
  } = usePortal();

  const workRequestTypes = state.settings.workRequestTypes?.length ? state.settings.workRequestTypes : state.settings.categories;
  const projectInfoCategories = state.settings.projectInfoCategories?.length ? state.settings.projectInfoCategories : state.settings.categories;

  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailRequestId, setDetailRequestId] = useState<string | null>(null);
  const [uploadRequestId, setUploadRequestId] = useState<string | null>(null);
  const [historyRequestId, setHistoryRequestId] = useState<string | null>(null);
  const [actionRequestId, setActionRequestId] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<AttachmentRef | null>(null);
  const [historyMode, setHistoryMode] = useState<"TRANSFER" | "REVISION">("TRANSFER");
  const [detailFileSearch, setDetailFileSearch] = useState("");
  const [detailFileType, setDetailFileType] = useState("ALL");
  const [detailFileDate, setDetailFileDate] = useState("");

  const [createForm, setCreateForm] = useState({
    parentType: "BID" as "BID" | "PROJECT",
    parentId: state.projects.find((project) => project.type === "BID" && !state.workRequests.some((request) => request.parentId === project.id))?.id || "",
    title: "",
    category: workRequestTypes[0] || "General",
    priority: "High" as "High" | "Medium" | "Low",
    attachmentName: "",
    attachmentCategory: projectInfoCategories[0] || "General",
    notes: "",
    assignedDivisionId: "div-ecm",
  });

  const [leaderChoice, setLeaderChoice] = useState("");
  const [memberChoice, setMemberChoice] = useState("");
  const [tmsChoice, setTmsChoice] = useState({
    drawingId: "member-tms-m1",
    checkingId: "member-tms-m2",
    approvalId: "member-tms-m3",
  });
  const [drawingDocName, setDrawingDocName] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [uploadDoc, setUploadDoc] = useState<DocumentFormRow>(createEmptyDocumentRow(state.settings.categories[0] || "General"));
  const [actionDoc, setActionDoc] = useState<DocumentFormRow>(createEmptyDocumentRow(state.settings.categories[0] || "General"));
  const [listDocForm, setListDocForm] = useState({ name: "", category: state.settings.categories[0] || "General" });
  const [showListDialog, setShowListDialog] = useState<string | null>(null);

  const availableParents = useMemo(() => {
    if (createForm.parentType === "BID") {
      return state.projects.filter((project) => {
        const alreadyHasWorkRequest = state.workRequests.some((request) => request.parentId === project.id);
        return project.type === "BID" && !alreadyHasWorkRequest;
      });
    }

    return state.projects.filter((project) => project.type === "PROJECT" && project.status === "ACTIVE");
  }, [createForm.parentType, state.projects, state.workRequests]);

  useEffect(() => {
    if (!availableParents.length) {
      setCreateForm((prev) => ({ ...prev, parentId: "" }));
      return;
    }

    if (!availableParents.some((project) => project.id === createForm.parentId)) {
      setCreateForm((prev) => ({ ...prev, parentId: availableParents[0]?.id || "" }));
    }
  }, [availableParents, createForm.parentId]);

  useEffect(() => {
    if (!detailRequestId) {
      setDetailFileSearch("");
      setDetailFileType("ALL");
      setDetailFileDate("");
    }
  }, [detailRequestId]);

  useEffect(() => {
    if (!historyRequestId) {
      setHistoryMode("TRANSFER");
    }
  }, [historyRequestId]);

  const getCurrentMember = () => {
    if (!currentActor.memberId) return undefined;
    return state.members.find((member) => member.id === currentActor.memberId);
  };

  const isDivisionLeadFor = (member: Member | undefined, divisionId?: string) => {
    if (!member || !divisionId) return false;
    return member.divisionId === divisionId && /lead|manager|leader/i.test(member.roleTitle);
  };

  const isWorkflowSupervisor = currentActor.role === "system_admin" || currentActor.role === "prime_consultant";

  const canPerformAction = (request: WorkRequest, action: WorkflowAction) => {
    const member = getCurrentMember();

    switch (action) {
      case "ASSIGN_LEADER":
        return (
          request.currentStatus === "DIVISION_NOTIFIED" &&
          (isWorkflowSupervisor || (currentActor.role === "division_lead" && isDivisionLeadFor(member, request.assignedDivisionId)))
        );

      case "ASSIGN_MEMBER":
        return (
          request.currentStatus === "LEADER_ASSIGNED" &&
          (isWorkflowSupervisor || (currentActor.role === "division_lead" && isDivisionLeadFor(member, request.assignedDivisionId)))
        );

      case "FORWARD_TO_TMS":
        return (
          request.currentStatus === "MEMBER_REVIEW" &&
          (isWorkflowSupervisor || (currentActor.role === "division_member" && currentActor.memberId === request.assignedMemberId))
        );

      case "ASSIGN_TMS_CHAIN":
        return request.currentStatus === "FORWARDED_TO_TMS" && (isWorkflowSupervisor || currentActor.role === "tms_manager");

      case "SUBMIT_DRAWING":
        return (
          (request.currentStatus === "TMS_ASSIGNED" || request.currentStatus === "DRAWING_IN_PROGRESS") &&
          (isWorkflowSupervisor || (currentActor.role === "tms_drawing" && currentActor.memberId === request.tmsAssignments?.drawingId))
        );

      case "CHECKING_APPROVE_REJECT":
        return (
          request.currentStatus === "CHECKING_REVIEW" &&
          (isWorkflowSupervisor || (currentActor.role === "tms_checking" && currentActor.memberId === request.tmsAssignments?.checkingId))
        );

      case "APPROVAL_APPROVE_REJECT":
        return (
          request.currentStatus === "APPROVAL_REVIEW" &&
          (isWorkflowSupervisor || (currentActor.role === "tms_approval" && currentActor.memberId === request.tmsAssignments?.approvalId))
        );

      case "DIVISION_MEMBER_REVIEW":
        return (
          request.currentStatus === "RETURNED_TO_DIVISION" &&
          (isWorkflowSupervisor || (currentActor.role === "division_member" && currentActor.memberId === request.assignedMemberId))
        );

      case "DIVISION_MANAGER_APPROVE":
        return (
          request.currentStatus === "DIVISION_MEMBER_APPROVED" &&
          (isWorkflowSupervisor || (currentActor.role === "division_lead" && isDivisionLeadFor(member, request.originDivisionId)))
        );

      case "FORWARD_TO_CCR":
        return (
          request.currentStatus === "DIVISION_MANAGER_APPROVED" &&
          (isWorkflowSupervisor || (currentActor.role === "division_lead" && isDivisionLeadFor(member, request.originDivisionId)))
        );

      case "FINAL_LIST":
        return request.currentStatus === "FORWARDED_TO_CCR" && (isWorkflowSupervisor || currentActor.role === "ccr_coordinator");

      case "SEND_BACKWARD": {
        if (!getBackwardTargetLabel(request.currentStatus)) return false;

        if (isWorkflowSupervisor) return true;

        if (request.currentStatus === "LEADER_ASSIGNED") {
          return currentActor.role === "division_lead" && isDivisionLeadFor(member, request.assignedDivisionId);
        }

        if (request.currentStatus === "MEMBER_REVIEW") {
          return currentActor.role === "division_member" && currentActor.memberId === request.assignedMemberId;
        }

        if (request.currentStatus === "FORWARDED_TO_TMS") {
          return currentActor.role === "tms_manager";
        }

        if (request.currentStatus === "TMS_ASSIGNED" || request.currentStatus === "DRAWING_IN_PROGRESS") {
          return currentActor.role === "tms_drawing" && currentActor.memberId === request.tmsAssignments?.drawingId;
        }

        if (request.currentStatus === "CHECKING_REVIEW") {
          return currentActor.role === "tms_checking" && currentActor.memberId === request.tmsAssignments?.checkingId;
        }

        if (request.currentStatus === "APPROVAL_REVIEW") {
          return currentActor.role === "tms_approval" && currentActor.memberId === request.tmsAssignments?.approvalId;
        }

        if (request.currentStatus === "RETURNED_TO_DIVISION") {
          return currentActor.role === "division_member" && currentActor.memberId === request.assignedMemberId;
        }

        if (request.currentStatus === "DIVISION_MEMBER_APPROVED" || request.currentStatus === "DIVISION_MANAGER_APPROVED") {
          return currentActor.role === "division_lead" && isDivisionLeadFor(member, request.originDivisionId);
        }

        if (request.currentStatus === "FORWARDED_TO_CCR") {
          return currentActor.role === "ccr_coordinator";
        }

        return false;
      }

      default:
        return false;
    }
  };

  const hasWorkflowAction = (request: WorkRequest) => {
    const actions: WorkflowAction[] = [
      "ASSIGN_LEADER",
      "ASSIGN_MEMBER",
      "FORWARD_TO_TMS",
      "ASSIGN_TMS_CHAIN",
      "SUBMIT_DRAWING",
      "CHECKING_APPROVE_REJECT",
      "APPROVAL_APPROVE_REJECT",
      "DIVISION_MEMBER_REVIEW",
      "DIVISION_MANAGER_APPROVE",
      "FORWARD_TO_CCR",
      "FINAL_LIST",
      "SEND_BACKWARD",
    ];

    return actions.some((action) => canPerformAction(request, action));
  };

  const visibleRequests = useMemo(() => {
    const q = search.toLowerCase();

    return state.workRequests.filter((request) => {
      const member = currentActor.memberId ? state.members.find((item) => item.id === currentActor.memberId) : undefined;

      const belongsByRole = (() => {
        switch (currentActor.role) {
          case "system_admin":
          case "prime_consultant":
          case "ccr_coordinator":
            return true;

          case "client_owner": {
            const parent = state.projects.find((project) => project.id === request.parentId);
            return parent?.clientId === currentActor.clientId;
          }

          case "division_lead":
            return member?.divisionId === request.assignedDivisionId || member?.divisionId === request.originDivisionId;

          case "division_member":
            return request.assignedMemberId === currentActor.memberId || member?.divisionId === request.originDivisionId || member?.divisionId === request.assignedDivisionId;

          case "tms_manager":
            return ["FORWARDED_TO_TMS", "TMS_ASSIGNED", "DRAWING_IN_PROGRESS", "CHECKING_REVIEW", "APPROVAL_REVIEW"].includes(request.currentStatus);

          case "tms_drawing":
            return request.tmsAssignments?.drawingId === currentActor.memberId;

          case "tms_checking":
            return request.tmsAssignments?.checkingId === currentActor.memberId;

          case "tms_approval":
            return request.tmsAssignments?.approvalId === currentActor.memberId;

          default:
            return false;
        }
      })();

      const matches = !q || request.title.toLowerCase().includes(q) || request.code.toLowerCase().includes(q);
      return belongsByRole && matches;
    });
  }, [currentActor.clientId, currentActor.memberId, currentActor.role, search, state.members, state.projects, state.workRequests]);

  const canCreate = actorCanCreateWorkRequests(currentActor.role);
  const selectedParent = state.projects.find((project) => project.id === createForm.parentId);
  const detailRequest = state.workRequests.find((request) => request.id === detailRequestId);
  const uploadRequest = state.workRequests.find((request) => request.id === uploadRequestId);
  const historyRequest = state.workRequests.find((request) => request.id === historyRequestId);
  const actionRequest = state.workRequests.find((request) => request.id === actionRequestId);

  const getLeaderOptions = (divisionId: string) =>
    state.members.filter((member) => member.divisionId === divisionId && /lead|manager|leader/i.test(member.roleTitle));

  const getMemberOptions = (divisionId: string) =>
    state.members.filter((member) => member.divisionId === divisionId && !/manager|leader/i.test(member.roleTitle));

  const getMemberName = (memberId?: string) => state.members.find((member) => member.id === memberId)?.name || "—";
  const getDivision = (divisionId?: string) => state.divisions.find((division) => division.id === divisionId);
  const getProject = (projectId?: string) => state.projects.find((project) => project.id === projectId);

  const getCurrentHandler = (request: WorkRequest) => {
    if (request.currentStatus === "HML_LISTED") return "HML Registry";
    if (request.currentStatus === "FORWARDED_TO_CCR") return "CCR";

    if (["FORWARDED_TO_TMS", "TMS_ASSIGNED", "DRAWING_IN_PROGRESS", "CHECKING_REVIEW", "APPROVAL_REVIEW"].includes(request.currentStatus)) {
      if (request.currentStatus === "CHECKING_REVIEW") return getMemberName(request.tmsAssignments?.checkingId);
      if (request.currentStatus === "APPROVAL_REVIEW") return getMemberName(request.tmsAssignments?.approvalId);
      if (request.currentStatus === "DRAWING_IN_PROGRESS" || request.currentStatus === "TMS_ASSIGNED") return getMemberName(request.tmsAssignments?.drawingId) || "TMS";
      return "TMS Manager";
    }

    if (request.currentStatus === "MEMBER_REVIEW") return getMemberName(request.assignedMemberId);
    if (request.currentStatus === "LEADER_ASSIGNED") return getMemberName(request.assignedLeaderId);
    return getDivision(request.assignedDivisionId)?.abbr || "—";
  };

  const openActionModal = (request: WorkRequest) => {
    setActionDoc(createEmptyDocumentRow(state.settings.categories[0] || "General", getDefaultActionUploadStage(request.currentStatus)));
    setActionRequestId(request.id);
  };

  useEffect(() => {
    if (!routeSearch.requestId) return;

    const routeKey = `${routeSearch.requestId}:${routeSearch.view || "details"}`;
    if (appliedNotificationRouteRef.current === routeKey) return;

    const targetRequest = state.workRequests.find((request) => request.id === routeSearch.requestId);
    if (!targetRequest) return;

    appliedNotificationRouteRef.current = routeKey;

    setSearch("");
    setExpandedId(targetRequest.id);

    setDetailRequestId(null);
    setHistoryRequestId(null);
    setUploadRequestId(null);
    setActionRequestId(null);

    window.setTimeout(() => {
      document.getElementById(`work-request-${targetRequest.id}`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 120);

    if (routeSearch.view === "history") {
      setHistoryMode("TRANSFER");
      setHistoryRequestId(targetRequest.id);
      return;
    }

    if (routeSearch.view === "upload") {
      setUploadRequestId(targetRequest.id);
      return;
    }

    if (routeSearch.view === "focus" || routeSearch.view === "action") {
      if (!hasWorkflowAction(targetRequest)) {
        setDetailRequestId(targetRequest.id);
      }

      return;
    }

    setDetailRequestId(targetRequest.id);
  }, [routeSearch.requestId, routeSearch.view, state.workRequests]);

  const handleCreate = () => {
    if (!createForm.title.trim()) return toast.error("Work request title is required");
    if (!createForm.parentId) return toast.error("A parent Bid/Project is required before creating a work request");

    const selected = state.projects.find((project) => project.id === createForm.parentId);
    if (selected?.type === "BID" && state.workRequests.some((request) => request.parentId === selected.id)) {
      return toast.error("This Bid already has a work request. One Bid can have only one Work Request.");
    }

    addWorkRequest(createForm);
    toast.success("Work request created and routed to division");
    setShowCreate(false);
    setCreateForm({
      parentType: "BID",
      parentId:
        state.projects.find((project) => project.type === "BID" && !state.workRequests.some((request) => request.parentId === project.id))?.id || "",
      title: "",
      category: workRequestTypes[0] || "General",
      priority: "High",
      attachmentName: "",
      attachmentCategory: projectInfoCategories[0] || "General",
      notes: "",
      assignedDivisionId: "div-ecm",
    });
  };

  const handleUploadFileChange = async (file?: File) => {
    if (!file) return;

    try {
      const fileDataUrl = await readFileAsDataUrl(file);
      setUploadDoc((prev) => ({
        ...prev,
        name: file.name,
        fileName: file.name,
        fileType: file.type || "application/octet-stream",
        fileSize: file.size,
        fileDataUrl,
      }));
    } catch {
      toast.error("Could not read selected file");
    }
  };

  const handleActionFileChange = async (file?: File) => {
    if (!file) return;

    try {
      const fileDataUrl = await readFileAsDataUrl(file);
      setActionDoc((prev) => ({
        ...prev,
        name: file.name,
        fileName: file.name,
        fileType: file.type || "application/octet-stream",
        fileSize: file.size,
        fileDataUrl,
      }));
    } catch {
      toast.error("Could not read selected file");
    }
  };

  const uploadUpdatedDocument = (request: WorkRequest) => {
    const normalized = normalizeDocument(uploadDoc);
    if (!normalized) return toast.error("Add text content or upload a file before submitting");

    addWorkRequestDocument(request.id, normalized);
    toast.success("Document uploaded", {
      description: "The document name is auto-set from the uploaded file. Duplicate file names are saved as a new version.",
    });

    setUploadDoc(createEmptyDocumentRow(state.settings.categories[0] || "General"));
    setUploadRequestId(null);
  };

  const uploadOptionalActionDocument = (request: WorkRequest, fallbackStage: string) => {
    const normalized = normalizeDocument({
      ...actionDoc,
      workflowStage: actionDoc.workflowStage || fallbackStage,
    });

    if (!normalized) return false;

    addWorkRequestDocument(request.id, normalized);
    setActionDoc(createEmptyDocumentRow(state.settings.categories[0] || "General", fallbackStage));
    return true;
  };

  const runWorkflowAction = (request: WorkRequest, message: string, fallbackStage: string, action: () => void) => {
    const attached = uploadOptionalActionDocument(request, fallbackStage);
    action();
    setReviewNote("");
    toast.success(message, {
      description: attached ? "Optional document was attached. Same file names are saved as a new version." : undefined,
    });
  };

  const openFinalListingFromAction = (request: WorkRequest) => {
    uploadOptionalActionDocument(request, "HML Registry");
    setListDocForm({
      name: request.drawingDocumentName || `${request.title} Final`,
      category: request.attachmentCategory,
    });
    setShowListDialog(request.id);
  };

  const renderAutoNamePreview = (doc: DocumentFormRow) => {
    const name = autoDocumentName(doc);

    if (name) {
      return <div className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground">{name}</div>;
    }

    return (
      <div className="rounded-lg border border-dashed border-border bg-background px-3 py-2 text-sm text-muted-foreground">
        File name will be used automatically after upload. Text-only documents will get an automatic timestamp name.
      </div>
    );
  };

  const renderFileCard = (doc: AttachmentRef) => (
    <div key={doc.id} className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <p className="font-medium text-card-foreground">{doc.name}</p>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">v{doc.version || 1}</span>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              {getFileTypeLabel(getFileTypeKey(doc))}
            </span>
            <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
              {getAttachmentFileGroup(doc) === "PRIMARY" ? "Primary" : "Workflow"}
            </span>
          </div>

          <p className="mt-1 text-xs text-muted-foreground">
            {doc.category} · {doc.workflowStage || "Workflow Collaboration"} · Uploaded by {doc.uploadedBy} · {formatDate(doc.uploadedAt)}
          </p>

          {doc.fileName ? (
            <p className="mt-1 text-xs text-muted-foreground">
              File: {doc.fileName} · {formatFileSize(doc.fileSize)}
            </p>
          ) : null}

          {doc.textContent ? <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{doc.textContent}</p> : null}
          {doc.note ? <p className="mt-2 text-xs text-muted-foreground">Note: {doc.note}</p> : null}
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setPreviewFile(doc)}>
            <Eye className="h-4 w-4" /> View
          </Button>

          <Button variant="outline" size="sm" onClick={() => void downloadAttachment(doc)}>
            <Download className="h-4 w-4" /> Download
          </Button>
        </div>
      </div>
    </div>
  );

  const renderOptionalActionUploadFields = () => (
    <div className="rounded-xl border border-border bg-muted/20 p-4">
      <div className="mb-3">
        <h4 className="text-sm font-semibold text-card-foreground">Optional File Attachment for This Action</h4>
        <p className="text-xs text-muted-foreground">
          Upload any file type or add a text document. File name is set automatically from the uploaded file. Same file name becomes next version.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Document Name</label>
          {renderAutoNamePreview(actionDoc)}
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Category</label>
          <select
            value={actionDoc.category}
            onChange={(event) => setActionDoc((prev) => ({ ...prev, category: event.target.value }))}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {state.settings.categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Workflow Stage</label>
          <select
            value={actionDoc.workflowStage || "Workflow Collaboration"}
            onChange={(event) => setActionDoc((prev) => ({ ...prev, workflowStage: event.target.value }))}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {workflowUploadStages.map((stage) => (
              <option key={stage} value={stage}>
                {stage}
              </option>
            ))}
          </select>
        </div>

        <div className="md:col-span-2">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Upload File</label>
          <input
            type="file"
            onChange={(event) => void handleActionFileChange(event.target.files?.[0])}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1 file:text-xs file:font-medium"
          />
          {actionDoc.fileName ? (
            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <Paperclip className="h-3 w-3" /> {actionDoc.fileName} · {formatFileSize(actionDoc.fileSize)}
            </p>
          ) : null}
        </div>

        <div className="md:col-span-2">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Text Document</label>
          <textarea
            value={actionDoc.textContent || ""}
            onChange={(event) => setActionDoc((prev) => ({ ...prev, textContent: event.target.value }))}
            placeholder="Write or paste text document here. Name will be generated automatically if no file is uploaded."
            rows={3}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="md:col-span-2">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Attachment Note</label>
          <input
            value={actionDoc.note || ""}
            onChange={(event) => setActionDoc((prev) => ({ ...prev, note: event.target.value }))}
            placeholder="Optional file note"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>
    </div>
  );

  const renderActionPanel = (request: WorkRequest) => {
    const leaderOptions = getLeaderOptions(request.assignedDivisionId);
    const memberOptions = getMemberOptions(request.assignedDivisionId);

    const canAssignLeader = canPerformAction(request, "ASSIGN_LEADER");
    const canAssignMember = canPerformAction(request, "ASSIGN_MEMBER");
    const canForward = canPerformAction(request, "FORWARD_TO_TMS");
    const canAssignTms = canPerformAction(request, "ASSIGN_TMS_CHAIN");
    const canSubmitDrawing = canPerformAction(request, "SUBMIT_DRAWING");
    const canCheck = canPerformAction(request, "CHECKING_APPROVE_REJECT");
    const canApprove = canPerformAction(request, "APPROVAL_APPROVE_REJECT");
    const canOriginMember = canPerformAction(request, "DIVISION_MEMBER_REVIEW");
    const canOriginManager = canPerformAction(request, "DIVISION_MANAGER_APPROVE");
    const canForwardToCcr = canPerformAction(request, "FORWARD_TO_CCR");
    const canList = canPerformAction(request, "FINAL_LIST");
    const canBackward = canPerformAction(request, "SEND_BACKWARD") && shouldShowGenericBackward(request.currentStatus);
    const backwardTargetLabel = getBackwardTargetLabel(request.currentStatus);

    const hasActions =
      canAssignLeader ||
      canAssignMember ||
      canForward ||
      canAssignTms ||
      canSubmitDrawing ||
      canCheck ||
      canApprove ||
      canOriginMember ||
      canOriginManager ||
      canForwardToCcr ||
      canList ||
      canBackward;

    if (!hasActions) {
      return (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
          No workflow action is available for your current role at this stage.
        </div>
      );
    }

    return (
      <div className="grid gap-4 md:grid-cols-2">
        {canAssignLeader && (
          <div className="space-y-3 rounded-xl border border-border bg-background p-4">
            <h4 className="text-sm font-semibold text-card-foreground">Assign Division Lead</h4>
            <select
              value={leaderChoice}
              onChange={(event) => setLeaderChoice(event.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Select lead</option>
              {leaderOptions.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
            <Button
              className="w-full"
              onClick={() => {
                if (!leaderChoice) return toast.error("Select a division lead first");
                runWorkflowAction(request, "Division lead assigned", "ECM / PMO Review", () => assignLeader(request.id, leaderChoice));
                setLeaderChoice("");
              }}
            >
              Assign Lead
            </Button>
          </div>
        )}

        {canAssignMember && (
          <div className="space-y-3 rounded-xl border border-border bg-background p-4">
            <h4 className="text-sm font-semibold text-card-foreground">Assign Member</h4>
            <select
              value={memberChoice}
              onChange={(event) => setMemberChoice(event.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Select member</option>
              {memberOptions.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
            <Button
              className="w-full"
              onClick={() => {
                if (!memberChoice) return toast.error("Select a member first");
                runWorkflowAction(request, "Member assigned", "ECM / PMO Review", () => assignMember(request.id, memberChoice));
                setMemberChoice("");
              }}
            >
              Assign Member
            </Button>
          </div>
        )}

        {canForward && (
          <div className="space-y-3 rounded-xl border border-border bg-background p-4">
            <h4 className="text-sm font-semibold text-card-foreground">Forward to TMS</h4>
            <textarea
              value={reviewNote}
              onChange={(event) => setReviewNote(event.target.value)}
              placeholder="Forwarding note"
              className="h-24 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <Button className="w-full" onClick={() => runWorkflowAction(request, "Forwarded to TMS", "TMS Manager Assignment", () => forwardToTms(request.id, reviewNote))}>
              <Send className="h-4 w-4" />
              Forward to TMS
            </Button>
          </div>
        )}

        {canAssignTms && (
          <div className="space-y-3 rounded-xl border border-border bg-background p-4">
            <h4 className="text-sm font-semibold text-card-foreground">Assign TMS Roles</h4>
            <select
              value={tmsChoice.drawingId}
              onChange={(event) => setTmsChoice((prev) => ({ ...prev, drawingId: event.target.value }))}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {state.members
                .filter((member) => member.divisionId === "div-tms-eng")
                .map((member) => (
                  <option key={member.id} value={member.id}>
                    Drawing — {member.name}
                  </option>
                ))}
            </select>

            <select
              value={tmsChoice.checkingId}
              onChange={(event) => setTmsChoice((prev) => ({ ...prev, checkingId: event.target.value }))}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {state.members
                .filter((member) => member.divisionId === "div-tms-eng")
                .map((member) => (
                  <option key={member.id} value={member.id}>
                    Checking — {member.name}
                  </option>
                ))}
            </select>

            <select
              value={tmsChoice.approvalId}
              onChange={(event) => setTmsChoice((prev) => ({ ...prev, approvalId: event.target.value }))}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {state.members
                .filter((member) => member.divisionId === "div-tms-eng")
                .map((member) => (
                  <option key={member.id} value={member.id}>
                    Approval — {member.name}
                  </option>
                ))}
            </select>

            <Button className="w-full" onClick={() => runWorkflowAction(request, "TMS chain assigned", "TMS Manager Assignment", () => assignTmsChain(request.id, tmsChoice))}>
              Assign TMS Chain
            </Button>
          </div>
        )}

        {canSubmitDrawing && (
          <div className="space-y-3 rounded-xl border border-border bg-background p-4">
            <h4 className="text-sm font-semibold text-card-foreground">Submit Drawing - M1</h4>
            <input
              value={drawingDocName}
              onChange={(event) => setDrawingDocName(event.target.value)}
              placeholder="Drawing output package name"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <Button
              className="w-full"
              onClick={() => {
                if (!drawingDocName.trim()) return toast.error("Drawing document name is required");
                runWorkflowAction(request, "Drawing submitted", "TMS Drawing - M1", () => submitDrawing(request.id, drawingDocName.trim()));
                setDrawingDocName("");
              }}
            >
              Submit Drawing
            </Button>
          </div>
        )}

        {canCheck && (
          <div className="space-y-3 rounded-xl border border-border bg-background p-4">
            <h4 className="text-sm font-semibold text-card-foreground">Checking Review - M2</h4>
            <textarea
              value={reviewNote}
              onChange={(event) => setReviewNote(event.target.value)}
              placeholder="Checking note"
              className="h-24 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="flex gap-2">
              <Button className="flex-1" onClick={() => runWorkflowAction(request, "Checking approved", "TMS Checking - M2", () => reviewChecking(request.id, true, reviewNote))}>
                <CheckCircle2 className="h-4 w-4" />
                Approve
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={() => runWorkflowAction(request, "Checking rejected and returned to drawing", "TMS Checking - M2", () => reviewChecking(request.id, false, reviewNote))}
              >
                <XCircle className="h-4 w-4" />
                Backward
              </Button>
            </div>
          </div>
        )}

        {canApprove && (
          <div className="space-y-3 rounded-xl border border-border bg-background p-4">
            <h4 className="text-sm font-semibold text-card-foreground">TMS Approval - M3</h4>
            <textarea
              value={reviewNote}
              onChange={(event) => setReviewNote(event.target.value)}
              placeholder="Approval note"
              className="h-24 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="flex gap-2">
              <Button className="flex-1" onClick={() => runWorkflowAction(request, "TMS approved and returned to division", "TMS Approval - M3", () => reviewApproval(request.id, true, reviewNote))}>
                <CheckCircle2 className="h-4 w-4" />
                Approve
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={() => runWorkflowAction(request, "TMS approval rejected and returned to drawing", "TMS Approval - M3", () => reviewApproval(request.id, false, reviewNote))}
              >
                <XCircle className="h-4 w-4" />
                Backward
              </Button>
            </div>
          </div>
        )}

        {canOriginMember && (
          <div className="space-y-3 rounded-xl border border-border bg-background p-4">
            <h4 className="text-sm font-semibold text-card-foreground">Division Member Review</h4>
            <textarea
              value={reviewNote}
              onChange={(event) => setReviewNote(event.target.value)}
              placeholder="Review note"
              className="h-24 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="flex gap-2">
              <Button className="flex-1" onClick={() => runWorkflowAction(request, "Division member approved", "Division Final Review", () => originMemberDecision(request.id, true, reviewNote))}>
                <CheckCircle2 className="h-4 w-4" />
                Approve
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={() => runWorkflowAction(request, "Returned back to TMS", "Division Final Review", () => originMemberDecision(request.id, false, reviewNote))}
              >
                <XCircle className="h-4 w-4" />
                Backward
              </Button>
            </div>
          </div>
        )}

        {canOriginManager && (
          <div className="space-y-3 rounded-xl border border-border bg-background p-4">
            <h4 className="text-sm font-semibold text-card-foreground">Division Manager Approval</h4>
            <textarea
              value={reviewNote}
              onChange={(event) => setReviewNote(event.target.value)}
              placeholder="Manager note"
              className="h-24 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <Button className="w-full" onClick={() => runWorkflowAction(request, "Division manager approved", "Division Final Review", () => originManagerApprove(request.id, reviewNote))}>
              <CheckCircle2 className="h-4 w-4" />
              Approve as Manager
            </Button>
          </div>
        )}

        {canForwardToCcr && (
          <div className="space-y-3 rounded-xl border border-border bg-background p-4">
            <h4 className="text-sm font-semibold text-card-foreground">Forward to CCR</h4>
            <textarea
              value={reviewNote}
              onChange={(event) => setReviewNote(event.target.value)}
              placeholder="Forwarding note"
              className="h-24 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <Button className="w-full" onClick={() => runWorkflowAction(request, "Forwarded to CCR", "CCR Closeout", () => forwardToCcr(request.id, reviewNote))}>
              <Send className="h-4 w-4" />
              Forward to CCR
            </Button>
          </div>
        )}

        {canBackward && backwardTargetLabel ? (
          <div className="space-y-3 rounded-xl border border-border bg-background p-4">
            <h4 className="text-sm font-semibold text-card-foreground">Send Back / Rework</h4>
            <p className="text-xs text-muted-foreground">
              Return this request to <span className="font-medium text-card-foreground">{backwardTargetLabel}</span> for correction.
            </p>
            <textarea
              value={reviewNote}
              onChange={(event) => setReviewNote(event.target.value)}
              placeholder="Backward reason is required"
              className="h-24 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <Button
              variant="destructive"
              className="w-full"
              onClick={() => {
                if (!reviewNote.trim()) return toast.error("Backward reason is required");
                runWorkflowAction(request, `Sent backward to ${backwardTargetLabel}`, getDefaultActionUploadStage(request.currentStatus), () => sendBackward(request.id, reviewNote));
              }}
            >
              <XCircle className="h-4 w-4" />
              Send Back
            </Button>
          </div>
        ) : null}

        {canList && (
          <div className="space-y-3 rounded-xl border border-border bg-background p-4">
            <h4 className="text-sm font-semibold text-card-foreground">Merge / Final HML Listing</h4>
            <Button className="w-full" onClick={() => openFinalListingFromAction(request)}>
              <GitMerge className="h-4 w-4" />
              Merge Final Document
            </Button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <PageHeader
        title="Work Requests"
        description="Track and manage work requests across divisions"
        actions={
          canCreate ? (
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" /> New Work Request
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search work requests..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full rounded-lg border border-input bg-background py-2 pl-9 pr-4 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      <div className="space-y-3">
        {visibleRequests.map((request) => {
          const division = getDivision(request.assignedDivisionId);
          const parent = getProject(request.parentId);
          const isExpanded = expandedId === request.id;
          const currentHandler = getCurrentHandler(request);

          return (
            <div id={`work-request-${request.id}`} key={request.id} className="overflow-hidden rounded-xl border border-border bg-card scroll-mt-6">
              <button
                type="button"
                onClick={() => setExpandedId(isExpanded ? null : request.id)}
                className="flex w-full flex-col gap-4 px-5 py-4 text-left transition-colors hover:bg-muted/25 lg:flex-row lg:items-center lg:justify-between"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{request.code}</span>
                    <StatusBadge status={statusToSimple(request.currentStatus)} />
                    <span className="text-xs font-medium text-muted-foreground">{requestStageLabel(request.currentStatus)}</span>
                    <span className={`text-xs font-semibold ${priorityClass(request.priority)}`}>{request.priority}</span>
                    <span className="inline-flex items-center rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                      {request.parentType === "BID" ? "Bid" : "Project"}
                    </span>
                  </div>
                  <h3 className="mt-2 text-sm font-semibold text-card-foreground">{request.title}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Project: <span className="font-medium text-card-foreground">{parent ? getProjectLabel(parent) : "No parent project"}</span>
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground lg:justify-end">
                  <span>{parent?.code || "No parent"}</span>
                  <span>{division?.abbr || "—"}</span>
                  <span>{currentHandler}</span>
                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </button>

              {isExpanded ? (
                <div className="border-t border-border px-5 py-4">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Workflow Progress</p>

                  <div className="overflow-x-auto pb-2">
                    <div className="min-w-[1500px]">
                      <WorkflowTimeline steps={getWorkflowSteps(request, division?.abbr || "ECM")} />
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => setDetailRequestId(request.id)}>
                      <Eye className="h-4 w-4" /> Details
                    </Button>

                    <Button variant="outline" size="sm" onClick={() => { setHistoryMode("TRANSFER"); setHistoryRequestId(request.id); }}>
                      <History className="h-4 w-4" /> History ({request.revisionHistory.length})
                    </Button>

                    <Button variant="outline" size="sm" onClick={() => setUploadRequestId(request.id)}>
                      <Upload className="h-4 w-4" /> Upload File
                    </Button>

                    {hasWorkflowAction(request) ? (
                      <Button size="sm" onClick={() => openActionModal(request)}>
                        <Send className="h-4 w-4" /> Workflow Action
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}

        {!visibleRequests.length && (
          <div className="rounded-xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
            No visible work requests for the current actor.
          </div>
        )}
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Create Work Request</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <p className="mb-2 text-sm font-medium text-foreground">Parent Type</p>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="radio"
                    checked={createForm.parentType === "BID"}
                    onChange={() =>
                      setCreateForm((prev) => ({
                        ...prev,
                        parentType: "BID",
                        parentId:
                          state.projects.find((project) => project.type === "BID" && !state.workRequests.some((request) => request.parentId === project.id))?.id || "",
                      }))
                    }
                  />
                  Bid
                </label>
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="radio"
                    checked={createForm.parentType === "PROJECT"}
                    onChange={() =>
                      setCreateForm((prev) => ({
                        ...prev,
                        parentType: "PROJECT",
                        parentId: state.projects.find((project) => project.type === "PROJECT" && project.status === "ACTIVE")?.id || "",
                      }))
                    }
                  />
                  Project
                </label>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">Select {createForm.parentType}</label>
                <select
                  value={createForm.parentId}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, parentId: event.target.value }))}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Choose</option>
                  {availableParents.length ? (
                    availableParents.map((project) => (
                      <option key={project.id} value={project.id}>
                        {getProjectLabel(project)}
                      </option>
                    ))
                  ) : (
                    <option value="">No eligible parent available</option>
                  )}
                </select>

                {selectedParent ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Selected parent: <span className="font-medium text-card-foreground">{getProjectLabel(selectedParent)}</span>
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {createForm.parentType === "BID"
                      ? "Create a new Bid first. Each Bid can have only one Work Request."
                      : "Create or convert an active Project first, then create the work request under it."}
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">Assigned Division</label>
                <select
                  value={createForm.assignedDivisionId}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, assignedDivisionId: event.target.value }))}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {state.divisions
                    .filter((division) => ["div-ecm", "div-pmo"].includes(division.id))
                    .map((division) => (
                      <option key={division.id} value={division.id}>
                        {division.abbr} — {division.name}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">Title</label>
                <input
                  list="work-request-type-options"
                  value={createForm.title}
                  onChange={(event) => {
                    const value = event.target.value;
                    setCreateForm((prev) => ({
                      ...prev,
                      title: value,
                      category: workRequestTypes.includes(value) ? value : prev.category,
                    }));
                  }}
                  placeholder="Select or type custom work/doc request"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />

                <datalist id="work-request-type-options">
                  {workRequestTypes.map((item) => (
                    <option key={item} value={item} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">Category</label>
                <select
                  value={createForm.category}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, category: event.target.value }))}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {workRequestTypes.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">Attachment Name</label>
                <input
                  value={createForm.attachmentName}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, attachmentName: event.target.value }))}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">Attachment Category</label>
                <select
                  value={createForm.attachmentCategory}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, attachmentCategory: event.target.value }))}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {projectInfoCategories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">Priority</label>
                <select
                  value={createForm.priority}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, priority: event.target.value as "High" | "Medium" | "Low" }))}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-foreground">Notes</label>
                <textarea
                  value={createForm.notes}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, notes: event.target.value }))}
                  className="h-24 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate}>Create Work Request</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!detailRequest} onOpenChange={() => setDetailRequestId(null)}>
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Work Request Details</DialogTitle>
          </DialogHeader>

          {detailRequest
            ? (() => {
                const parent = getProject(detailRequest.parentId);
                const division = getDivision(detailRequest.assignedDivisionId);
                const primaryFiles = parent?.initialDocuments.filter((doc) => getAttachmentFileGroup(doc) === "PRIMARY") || [];
                const workflowFiles = parent?.initialDocuments.filter((doc) => getAttachmentFileGroup(doc) === "WORKFLOW") || [];
                const allFiles = [...primaryFiles, ...workflowFiles];
                const fileTypeOptions = Array.from(new Set(allFiles.map((doc) => getFileTypeKey(doc)))).sort((a, b) => a.localeCompare(b));
                const filteredPrimaryFiles = filterAttachmentFiles(primaryFiles, detailFileSearch, detailFileType, detailFileDate);
                const filteredWorkflowFiles = filterAttachmentFiles(workflowFiles, detailFileSearch, detailFileType, detailFileDate);
                const hasActiveFileFilter = Boolean(detailFileSearch.trim() || detailFileType !== "ALL" || detailFileDate);

                return (
                  <div className="space-y-5 py-2">
                    <div className="grid gap-3 rounded-xl border border-border bg-muted/20 p-4 text-sm md:grid-cols-4">
                      <div>
                        <p className="text-xs text-muted-foreground">Request</p>
                        <p className="font-medium text-foreground">{detailRequest.code}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Parent</p>
                        <p className="font-medium text-foreground">{parent?.code || "—"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Division</p>
                        <p className="font-medium text-foreground">{division?.abbr || "—"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Current Handler</p>
                        <p className="font-medium text-foreground">{getCurrentHandler(detailRequest)}</p>
                      </div>
                      <div className="md:col-span-2">
                        <p className="text-xs text-muted-foreground">Title</p>
                        <p className="font-medium text-foreground">{detailRequest.title}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Status</p>
                        <p className="font-medium text-foreground">{getWorkRequestStatusLabel(detailRequest.currentStatus)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Priority</p>
                        <p className={`font-medium ${priorityClass(detailRequest.priority)}`}>{detailRequest.priority}</p>
                      </div>
                      <div className="md:col-span-4">
                        <p className="text-xs text-muted-foreground">Notes</p>
                        <p className="font-medium text-foreground">{detailRequest.notes || "—"}</p>
                      </div>
                    </div>

                    <div className="rounded-xl border border-border bg-muted/20 p-4">
                      <div className="mb-3 flex flex-col gap-1">
                        <h4 className="text-sm font-semibold text-card-foreground">File Filters</h4>
                        <p className="text-xs text-muted-foreground">
                          Search by file name, filter by uploaded file type, or filter by a specific upload date.
                        </p>
                      </div>

                      <div className="grid gap-3 md:grid-cols-[1.4fr_0.8fr_0.8fr_auto] md:items-end">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-muted-foreground">Search File Name</label>
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                            <input
                              value={detailFileSearch}
                              onChange={(event) => setDetailFileSearch(event.target.value)}
                              placeholder="Search by file name..."
                              className="w-full rounded-lg border border-input bg-background py-2 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="mb-1 block text-xs font-medium text-muted-foreground">File Type</label>
                          <select
                            value={detailFileType}
                            onChange={(event) => setDetailFileType(event.target.value)}
                            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                          >
                            <option value="ALL">All Types</option>
                            {fileTypeOptions.map((type) => (
                              <option key={type} value={type}>
                                {getFileTypeLabel(type)}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="mb-1 block text-xs font-medium text-muted-foreground">Upload Date</label>
                          <input
                            type="date"
                            value={detailFileDate}
                            onChange={(event) => setDetailFileDate(event.target.value)}
                            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                          />
                        </div>

                        <Button
                          variant="outline"
                          disabled={!hasActiveFileFilter}
                          onClick={() => {
                            setDetailFileSearch("");
                            setDetailFileType("ALL");
                            setDetailFileDate("");
                          }}
                        >
                          Clear
                        </Button>
                      </div>

                      <p className="mt-3 text-xs text-muted-foreground">
                        Showing {filteredPrimaryFiles.length + filteredWorkflowFiles.length} of {allFiles.length} file(s)
                      </p>
                    </div>

                    <div>
                      <h4 className="text-sm font-semibold text-card-foreground">Primary File List</h4>
                      <p className="mt-1 text-xs text-muted-foreground">Original client documents uploaded by CCR / Marketing.</p>

                      <div className="mt-3 space-y-3">
                        {filteredPrimaryFiles.length ? (
                          filteredPrimaryFiles.map((doc) => renderFileCard(doc))
                        ) : (
                          <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
                            {hasActiveFileFilter ? "No primary client document matches this filter." : "No primary client document uploaded yet."}
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <h4 className="text-sm font-semibold text-card-foreground">Workflow / Collaboration Files</h4>
                      <p className="mt-1 text-xs text-muted-foreground">Files uploaded later by client, ECM/PMO, TMS, CCR, or other authorized users.</p>

                      <div className="mt-3 space-y-3">
                        {filteredWorkflowFiles.length ? (
                          filteredWorkflowFiles.map((doc) => renderFileCard(doc))
                        ) : (
                          <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
                            {hasActiveFileFilter ? "No workflow collaboration file matches this filter." : "No workflow collaboration file uploaded yet."}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()
            : null}
        </DialogContent>
      </Dialog>

      <Dialog open={!!previewFile} onOpenChange={() => setPreviewFile(null)}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>File Preview</DialogTitle>
          </DialogHeader>

          {previewFile ? (
            <div className="space-y-4 py-2">
              <div className="grid gap-3 rounded-xl border border-border bg-muted/20 p-4 text-sm md:grid-cols-3">
                <div>
                  <p className="text-xs text-muted-foreground">Name</p>
                  <p className="font-medium text-foreground">{previewFile.name}</p>
                </div>

                <div>
                  <p className="text-xs text-muted-foreground">Version</p>
                  <p className="font-medium text-foreground">v{previewFile.version || 1}</p>
                </div>

                <div>
                  <p className="text-xs text-muted-foreground">File Type</p>
                  <p className="font-medium text-foreground">{getFileTypeLabel(getFileTypeKey(previewFile))}</p>
                </div>

                <div>
                  <p className="text-xs text-muted-foreground">Category</p>
                  <p className="font-medium text-foreground">{previewFile.category}</p>
                </div>

                <div>
                  <p className="text-xs text-muted-foreground">Uploaded By</p>
                  <p className="font-medium text-foreground">{previewFile.uploadedBy}</p>
                </div>

                <div>
                  <p className="text-xs text-muted-foreground">Uploaded At</p>
                  <p className="font-medium text-foreground">{formatDate(previewFile.uploadedAt)}</p>
                </div>
              </div>

              {previewFile.fileDataUrl && isImageFile(previewFile) ? (
                <div className="rounded-xl border border-border bg-muted/20 p-3">
                  <img src={previewFile.fileDataUrl} alt={previewFile.name} className="max-h-[60vh] w-full rounded-lg object-contain" />
                </div>
              ) : null}

              {previewFile.fileDataUrl && isPdfFile(previewFile) ? (
                <div className="overflow-hidden rounded-xl border border-border bg-muted/20">
                  <iframe src={previewFile.fileDataUrl} title={previewFile.name} className="h-[65vh] w-full" />
                </div>
              ) : null}

              {previewFile.textContent ? (
                <div className="rounded-xl border border-border bg-muted/20 p-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Text Content</p>
                  <pre className="whitespace-pre-wrap text-sm text-card-foreground">{previewFile.textContent}</pre>
                </div>
              ) : null}

              {previewFile.fileDataUrl && !isImageFile(previewFile) && !isPdfFile(previewFile) && !previewFile.textContent ? (
                <div className="rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
                  Preview is not available for this file type. Please download the file to view it.
                </div>
              ) : null}

              {!previewFile.fileDataUrl && !previewFile.textContent ? (
                <div className="rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
                  Preview is not available for this older/demo metadata file. You can still download its metadata.
                </div>
              ) : null}

              {previewFile.note ? (
                <div className="rounded-xl border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
                  <span className="font-medium text-card-foreground">Note:</span> {previewFile.note}
                </div>
              ) : null}

              <div className="flex justify-end">
                <Button onClick={() => void downloadAttachment(previewFile)}>
                  <Download className="h-4 w-4" />
                  Download
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!actionRequest}
        onOpenChange={(open) => {
          if (!open) {
            setActionRequestId(null);
            setActionDoc(createEmptyDocumentRow(state.settings.categories[0] || "General"));
          }
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Workflow Action</DialogTitle>
          </DialogHeader>

          {actionRequest ? (
            <div className="space-y-5 py-2">
              <div className="grid gap-3 rounded-xl border border-border bg-muted/20 p-4 text-sm md:grid-cols-4">
                <div>
                  <p className="text-xs text-muted-foreground">Request</p>
                  <p className="font-medium text-foreground">{actionRequest.code}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Title</p>
                  <p className="font-medium text-foreground">{actionRequest.title}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <p className="font-medium text-foreground">{getWorkRequestStatusLabel(actionRequest.currentStatus)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Current Handler</p>
                  <p className="font-medium text-foreground">{getCurrentHandler(actionRequest)}</p>
                </div>
              </div>

              {renderOptionalActionUploadFields()}

              {renderActionPanel(actionRequest)}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={!!uploadRequest} onOpenChange={() => setUploadRequestId(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Upload Workflow / Collaboration File</DialogTitle>
          </DialogHeader>

          {uploadRequest ? (
            <div className="space-y-4 py-2">
              <div className="rounded-xl border border-border bg-muted/20 p-4 text-sm">
                <div className="grid gap-3 md:grid-cols-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Request</p>
                    <p className="font-medium text-foreground">{uploadRequest.code}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Title</p>
                    <p className="font-medium text-foreground">{uploadRequest.title}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Current Stage</p>
                    <p className="font-medium text-foreground">{getWorkRequestStatusLabel(uploadRequest.currentStatus)}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-muted/20 p-4">
                <div className="mb-3">
                  <h4 className="text-sm font-semibold text-card-foreground">Upload Updated File / Text Document</h4>
                  <p className="text-xs text-muted-foreground">
                    File name is set automatically from the uploaded file. Same file name becomes next version.
                  </p>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">Document Name</label>
                    {renderAutoNamePreview(uploadDoc)}
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">Category</label>
                    <select
                      value={uploadDoc.category}
                      onChange={(event) => setUploadDoc((prev) => ({ ...prev, category: event.target.value }))}
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      {state.settings.categories.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">Workflow Stage</label>
                    <select
                      value={uploadDoc.workflowStage || "Workflow Collaboration"}
                      onChange={(event) => setUploadDoc((prev) => ({ ...prev, workflowStage: event.target.value }))}
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      {workflowUploadStages.map((stage) => (
                        <option key={stage} value={stage}>
                          {stage}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">Upload File</label>
                    <input
                      type="file"
                      onChange={(event) => void handleUploadFileChange(event.target.files?.[0])}
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1 file:text-xs file:font-medium"
                    />
                    {uploadDoc.fileName ? (
                      <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                        <Paperclip className="h-3 w-3" /> {uploadDoc.fileName} · {formatFileSize(uploadDoc.fileSize)}
                      </p>
                    ) : null}
                  </div>

                  <div className="md:col-span-2">
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">Text Document</label>
                    <textarea
                      value={uploadDoc.textContent || ""}
                      onChange={(event) => setUploadDoc((prev) => ({ ...prev, textContent: event.target.value }))}
                      placeholder="Write or paste document text here. Name will be generated automatically if no file is uploaded."
                      rows={4}
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">Note</label>
                    <input
                      value={uploadDoc.note || ""}
                      onChange={(event) => setUploadDoc((prev) => ({ ...prev, note: event.target.value }))}
                      placeholder="Optional workflow note"
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadRequestId(null)}>
              Cancel
            </Button>
            <Button onClick={() => uploadRequest && uploadUpdatedDocument(uploadRequest)}>
              <Upload className="h-4 w-4" /> Upload File
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!historyRequest} onOpenChange={() => setHistoryRequestId(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>History</DialogTitle>
          </DialogHeader>

          {historyRequest
            ? (() => {
                const parent = getProject(historyRequest.parentId);
                const relatedFiles = parent?.initialDocuments.filter((doc) => getAttachmentFileGroup(doc) === "WORKFLOW") || [];
                const revisionGroups = getDocumentRevisionGroups(relatedFiles);

                return (
                  <div className="space-y-4 py-2">
                    <div className="flex flex-wrap gap-3 rounded-xl border border-border bg-muted/20 p-3">
                      <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-card-foreground">
                        <input
                          type="radio"
                          checked={historyMode === "TRANSFER"}
                          onChange={() => setHistoryMode("TRANSFER")}
                        />
                        Transfer History
                      </label>

                      <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-card-foreground">
                        <input
                          type="radio"
                          checked={historyMode === "REVISION"}
                          onChange={() => setHistoryMode("REVISION")}
                        />
                        Revision History
                      </label>
                    </div>

                    {historyMode === "TRANSFER" ? (
                      <div className="space-y-0">
                        {[...historyRequest.revisionHistory].reverse().map((entry, index, list) => (
                          <div key={entry.id} className="relative flex gap-4 pb-6 last:pb-0">
                            <div className="relative flex w-4 justify-center">
                              <span className="mt-1 h-2.5 w-2.5 rounded-full bg-primary" />
                              {index < list.length - 1 ? <span className="absolute left-1/2 top-5 h-[calc(100%-0.5rem)] w-px -translate-x-1/2 bg-border" /> : null}
                            </div>
                            <div>
                              <h4 className="font-semibold text-card-foreground">{entry.action}</h4>
                              <p className="mt-1 text-sm text-muted-foreground">
                                {entry.by}
                                {entry.to ? (
                                  <>
                                    {" "}
                                    <ArrowRight className="mx-1 inline h-3 w-3" /> {entry.to}
                                  </>
                                ) : null}
                              </p>
                              <p className="text-xs text-muted-foreground">{formatDate(entry.at)}</p>
                              {entry.note ? <p className="mt-2 text-sm text-muted-foreground">“{entry.note}”</p> : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="rounded-xl border border-border bg-muted/20 p-4">
                          <h4 className="text-sm font-semibold text-card-foreground">Document Revision History</h4>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Files are grouped by file name. Re-uploading the same file name creates the next version.
                          </p>
                        </div>

                        {revisionGroups.length ? (
                          revisionGroups.map((group) => (
                            <div key={group.key} className="rounded-xl border border-border bg-card p-4">
                              <div className="mb-3 flex flex-wrap items-center gap-2">
                                <FileText className="h-4 w-4 text-muted-foreground" />
                                <h4 className="font-semibold text-card-foreground">{group.name}</h4>
                                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                                  {group.revisions.length} revision{group.revisions.length === 1 ? "" : "s"}
                                </span>
                              </div>

                              <div className="space-y-3">
                                {group.revisions.map((doc, index) => (
                                  <div key={doc.id} className="relative flex gap-3 rounded-lg border border-border bg-muted/20 p-3">
                                    <div className="flex h-8 min-w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                                      v{doc.version || index + 1}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <p className="text-sm font-medium text-card-foreground">{doc.name}</p>
                                      <p className="mt-1 text-xs text-muted-foreground">
                                        {doc.category} · {doc.workflowStage || "Workflow Collaboration"} · Uploaded by {doc.uploadedBy} · {formatDate(doc.uploadedAt)}
                                      </p>
                                      {doc.fileName ? (
                                        <p className="mt-1 text-xs text-muted-foreground">
                                          File: {doc.fileName} · {getFileTypeLabel(getFileTypeKey(doc))} · {formatFileSize(doc.fileSize)}
                                        </p>
                                      ) : null}
                                      {doc.note ? <p className="mt-2 text-xs text-muted-foreground">Note: {doc.note}</p> : null}
                                    </div>
                                    <div className="flex shrink-0 flex-wrap gap-2">
                                      <Button variant="outline" size="sm" onClick={() => setPreviewFile(doc)}>
                                        <Eye className="h-4 w-4" /> View
                                      </Button>
                                      <Button variant="outline" size="sm" onClick={() => void downloadAttachment(doc)}>
                                        <Download className="h-4 w-4" /> Download
                                      </Button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
                            No workflow document revision has been uploaded yet.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()
            : null}
        </DialogContent>
      </Dialog>

      <Dialog open={!!showListDialog} onOpenChange={() => setShowListDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Final HML Document Listing</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <input
              value={listDocForm.name}
              onChange={(event) => setListDocForm((prev) => ({ ...prev, name: event.target.value }))}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Final document name"
            />

            <select
              value={listDocForm.category}
              onChange={(event) => setListDocForm((prev) => ({ ...prev, category: event.target.value }))}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {state.settings.categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowListDialog(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (showListDialog && listDocForm.name.trim()) {
                  listFinalDocument(showListDialog, listDocForm);
                  toast.success("Final document merged/listed in HML registry");
                  setShowListDialog(null);
                }
              }}
            >
              Merge / List Document
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


// import { createFileRoute } from "@tanstack/react-router";
// import { useEffect, useMemo, useState } from "react";
// import { PageHeader } from "@/components/PageHeader";
// import { StatusBadge } from "@/components/StatusBadge";
// import { WorkflowTimeline } from "@/components/WorkflowTimeline";
// import { Button } from "@/components/ui/button";
// import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
// import {
//   actorCanCreateWorkRequests,
//   formatDate,
//   getProjectLabel,
//   getWorkRequestStatusLabel,
//   statusToSimple,
//   type AttachmentInput,
//   type AttachmentRef,
//   type Member,
//   type WorkRequest,
//   type WorkRequestStatus,
//   usePortal,
// } from "@/lib/portal-data";
// import {
//   ArrowRight,
//   CheckCircle2,
//   ChevronDown,
//   ChevronUp,
//   Download,
//   Eye,
//   FileText,
//   GitMerge,
//   History,
//   Paperclip,
//   Plus,
//   Search,
//   Send,
//   Upload,
//   XCircle,
// } from "lucide-react";
// import { toast } from "sonner";

// export const Route = createFileRoute("/work-requests")({
//   component: WorkRequestsPage,
//   head: () => ({
//     meta: [{ title: "Work Requests — Project Portal" }],
//   }),
// });

// type DocumentFormRow = AttachmentInput;

// type WorkflowAction =
//   | "ASSIGN_LEADER"
//   | "ASSIGN_MEMBER"
//   | "FORWARD_TO_TMS"
//   | "ASSIGN_TMS_CHAIN"
//   | "SUBMIT_DRAWING"
//   | "CHECKING_APPROVE_REJECT"
//   | "APPROVAL_APPROVE_REJECT"
//   | "DIVISION_MEMBER_REVIEW"
//   | "DIVISION_MANAGER_APPROVE"
//   | "FORWARD_TO_CCR"
//   | "FINAL_LIST";

// const workflowUploadStages = [
//   "Work Request Creation",
//   "ECM / PMO Review",
//   "TMS Manager Assignment",
//   "TMS Drawing - M1",
//   "TMS Checking - M2",
//   "TMS Approval - M3",
//   "Division Final Review",
//   "CCR Closeout",
//   "HML Registry",
//   "Workflow Collaboration",
// ];

// function createEmptyDocumentRow(category = "General", workflowStage = "Workflow Collaboration"): DocumentFormRow {
//   return {
//     name: "",
//     category,
//     textContent: "",
//     workflowStage,
//     note: "",
//   };
// }

// function readFileAsDataUrl(file: File) {
//   return new Promise<string>((resolve, reject) => {
//     const reader = new FileReader();
//     reader.onload = () => resolve(String(reader.result || ""));
//     reader.onerror = () => reject(reader.error || new Error("Unable to read file"));
//     reader.readAsDataURL(file);
//   });
// }

// function formatFileSize(size?: number) {
//   if (!size) return "Unknown size";
//   if (size < 1024) return `${size} B`;
//   if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
//   return `${(size / (1024 * 1024)).toFixed(1)} MB`;
// }

// function autoDocumentName(doc: DocumentFormRow) {
//   if (doc.fileName?.trim()) return doc.fileName.trim();
//   if (doc.name?.trim()) return doc.name.trim();

//   if (doc.textContent?.trim()) {
//     return `Text Document - ${new Date().toISOString().slice(0, 19).replace("T", " ")}`;
//   }

//   return "";
// }

// function normalizeDocument(doc: DocumentFormRow) {
//   const normalizedName = autoDocumentName(doc);

//   const normalized = {
//     ...doc,
//     name: normalizedName,
//     textContent: doc.textContent?.trim() || undefined,
//     note: doc.note?.trim() || undefined,
//   };

//   if (!normalized.textContent && !normalized.fileDataUrl && !normalized.fileName) return null;
//   return normalized;
// }

// function safeFileName(name: string) {
//   return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").trim() || "document";
// }

// function ensureTxtExtension(name: string) {
//   return /\.[a-z0-9]+$/i.test(name) ? name : `${name}.txt`;
// }

// async function downloadAttachment(doc: AttachmentRef) {
//   if (typeof window === "undefined") return;

//   if (doc.fileDataUrl) {
//     try {
//       const response = await fetch(doc.fileDataUrl);
//       const blob = await response.blob();
//       const objectUrl = URL.createObjectURL(blob);
//       const link = document.createElement("a");

//       link.href = objectUrl;
//       link.download = safeFileName(doc.fileName || doc.name || "download");
//       document.body.appendChild(link);
//       link.click();
//       document.body.removeChild(link);
//       URL.revokeObjectURL(objectUrl);
//       return;
//     } catch {
//       const link = document.createElement("a");
//       link.href = doc.fileDataUrl;
//       link.download = safeFileName(doc.fileName || doc.name || "download");
//       document.body.appendChild(link);
//       link.click();
//       document.body.removeChild(link);
//       return;
//     }
//   }

//   const fallbackText = doc.textContent?.trim()
//     ? doc.textContent
//     : [
//         `Document: ${doc.name}`,
//         `Category: ${doc.category}`,
//         `Workflow Stage: ${doc.workflowStage || "Workflow Collaboration"}`,
//         `Uploaded By: ${doc.uploadedBy}`,
//         `Uploaded At: ${formatDate(doc.uploadedAt)}`,
//         "",
//         doc.note || "Original file body is not available for this old/demo document because only metadata was stored.",
//       ].join("\n");

//   const blob = new Blob([fallbackText], { type: "text/plain;charset=utf-8" });
//   const objectUrl = URL.createObjectURL(blob);
//   const link = document.createElement("a");

//   link.href = objectUrl;
//   link.download = ensureTxtExtension(safeFileName(doc.name || "document"));
//   document.body.appendChild(link);
//   link.click();
//   document.body.removeChild(link);
//   URL.revokeObjectURL(objectUrl);
// }

// function priorityClass(priority: WorkRequest["priority"]) {
//   if (priority === "High") return "text-rose-600";
//   if (priority === "Medium") return "text-orange-600";
//   return "text-slate-600 dark:text-slate-300";
// }

// function requestStageLabel(status: WorkRequestStatus) {
//   if (status === "HML_LISTED") return "Listed";
//   if (["FORWARDED_TO_TMS", "TMS_ASSIGNED", "DRAWING_IN_PROGRESS", "CHECKING_REVIEW", "APPROVAL_REVIEW"].includes(status)) return "At TMS";
//   if (status === "RETURNED_TO_DIVISION") return "Returned";
//   if (status === "FORWARDED_TO_CCR") return "At CCR";
//   if (status === "DIVISION_MEMBER_APPROVED" || status === "DIVISION_MANAGER_APPROVED") return "Div Review";
//   return "Assigned";
// }

// // function workflowStepIndex(status: WorkRequestStatus) {
// //   if (status === "CREATED") return 0;
// //   if (status === "DIVISION_NOTIFIED") return 1;
// //   if (status === "LEADER_ASSIGNED") return 2;
// //   if (status === "MEMBER_REVIEW") return 3;
// //   if (status === "FORWARDED_TO_TMS") return 4;
// //   if (status === "TMS_ASSIGNED") return 6;
// //   if (status === "DRAWING_IN_PROGRESS") return 6;
// //   if (status === "CHECKING_REVIEW") return 7;
// //   if (status === "APPROVAL_REVIEW") return 8;
// //   if (status === "RETURNED_TO_DIVISION") return 9;
// //   if (status === "DIVISION_MEMBER_APPROVED") return 10;
// //   if (status === "DIVISION_MANAGER_APPROVED") return 11;
// //   if (status === "FORWARDED_TO_CCR") return 12;
// //   if (status === "HML_LISTED") return 13;
// //   return 0;
// // }

// function workflowStepIndex(status: WorkRequestStatus) {
//   if (status === "CREATED") return 0;
//   if (status === "DIVISION_NOTIFIED") return 1;
//   if (status === "LEADER_ASSIGNED") return 2;
//   if (status === "MEMBER_REVIEW") return 3;
//   if (status === "FORWARDED_TO_TMS") return 4;
//   if (status === "TMS_ASSIGNED") return 5;
//   if (status === "DRAWING_IN_PROGRESS") return 6;
//   if (status === "CHECKING_REVIEW") return 7;
//   if (status === "APPROVAL_REVIEW") return 8;
//   if (status === "RETURNED_TO_DIVISION") return 9;
//   if (status === "DIVISION_MEMBER_APPROVED") return 10;
//   if (status === "DIVISION_MANAGER_APPROVED") return 11;
//   if (status === "FORWARDED_TO_CCR") return 12;
//   if (status === "HML_LISTED") return 13;
//   return 0;
// }

// // function getWorkflowSteps(request: WorkRequest, divisionAbbr = "ECM") {
// //   const idx = workflowStepIndex(request.currentStatus);

// //   const allSteps = [
// //     {
// //       label: "CCR Created",
// //       department: "CCR",
// //     },
// //     {
// //       label: `${divisionAbbr} Lead Notified`,
// //       department: divisionAbbr,
// //     },
// //     {
// //       label: `${divisionAbbr} Lead Assigned`,
// //       department: divisionAbbr,
// //     },
// //     {
// //       label: `${divisionAbbr} Member Review`,
// //       department: divisionAbbr,
// //     },
// //     {
// //       label: "TMS Manager Intake",
// //       department: "TMS",
// //     },
// //     {
// //       label: "TMS Chain Assigned",
// //       department: "TMS Manager",
// //     },
// //     {
// //       label: "TMS-M1 Drawing",
// //       department: "M1",
// //     },
// //     {
// //       label: "TMS-M2 Checking",
// //       department: "M2",
// //     },
// //     {
// //       label: "TMS-M3 Approval",
// //       department: "M3",
// //     },
// //     {
// //       label: `${divisionAbbr} Member Final`,
// //       department: divisionAbbr,
// //     },
// //     {
// //       label: `${divisionAbbr} Lead Approval`,
// //       department: divisionAbbr,
// //     },
// //     {
// //       label: `${divisionAbbr} Forward CCR`,
// //       department: divisionAbbr,
// //     },
// //     {
// //       label: "CCR Final Listing",
// //       department: "CCR",
// //     },
// //     {
// //       label: "HML Listed",
// //       department: "HML",
// //     },
// //   ];

// //   return allSteps.map((step, stepIdx) => ({
// //     label: step.label,
// //     department: step.department,
// //     status:
// //       request.currentStatus === "HML_LISTED" || stepIdx < idx
// //         ? ("completed" as const)
// //         : stepIdx === idx
// //           ? ("active" as const)
// //           : ("pending" as const),
// //   }));
// // }
// function getWorkflowSteps(request: WorkRequest, divisionAbbr = "ECM") {
//   const idx = workflowStepIndex(request.currentStatus);

//   const allSteps = [
//     { label: "CCR Created", department: "CCR" },
//     { label: `${divisionAbbr} Notified`, department: divisionAbbr },
//     { label: `${divisionAbbr} Lead Assigned`, department: divisionAbbr },
//     { label: `${divisionAbbr} Member Review`, department: divisionAbbr },
//     { label: "TMS Manager Intake", department: "TMS" },
//     { label: "TMS Chain Assigned", department: "TMS Manager" },
//     { label: "TMS-M1 Drawing", department: "M1" },
//     { label: "TMS-M2 Checking", department: "M2" },
//     { label: "TMS-M3 Approval", department: "M3" },
//     { label: `${divisionAbbr} Member Final`, department: divisionAbbr },
//     { label: `${divisionAbbr} Lead Approval`, department: divisionAbbr },
//     { label: `${divisionAbbr} Forward CCR`, department: divisionAbbr },
//     { label: "CCR Final Listing", department: "CCR" },
//     { label: "HML Listed", department: "HML" },
//   ];

//   return allSteps.map((step, stepIdx) => ({
//     label: step.label,
//     department: step.department,
//     status:
//       request.currentStatus === "HML_LISTED" || stepIdx < idx
//         ? ("completed" as const)
//         : stepIdx === idx
//           ? ("active" as const)
//           : ("pending" as const),
//   }));
// }
// function getDefaultActionUploadStage(status: WorkRequestStatus) {
//   if (status === "FORWARDED_TO_TMS") return "TMS Manager Assignment";
//   if (status === "TMS_ASSIGNED" || status === "DRAWING_IN_PROGRESS") return "TMS Drawing - M1";
//   if (status === "CHECKING_REVIEW") return "TMS Checking - M2";
//   if (status === "APPROVAL_REVIEW") return "TMS Approval - M3";
//   if (status === "RETURNED_TO_DIVISION" || status === "DIVISION_MEMBER_APPROVED" || status === "DIVISION_MANAGER_APPROVED") return "Division Final Review";
//   if (status === "FORWARDED_TO_CCR") return "CCR Closeout";
//   if (status === "HML_LISTED") return "HML Registry";
//   return "Workflow Collaboration";
// }

// function WorkRequestsPage() {
//   const {
//     state,
//     currentActor,
//     addWorkRequest,
//     addWorkRequestDocument,
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
//   } = usePortal();

//   const [search, setSearch] = useState("");
//   const [showCreate, setShowCreate] = useState(false);
//   const [expandedId, setExpandedId] = useState<string | null>(null);
//   const [detailRequestId, setDetailRequestId] = useState<string | null>(null);
//   const [uploadRequestId, setUploadRequestId] = useState<string | null>(null);
//   const [historyRequestId, setHistoryRequestId] = useState<string | null>(null);
//   const [actionRequestId, setActionRequestId] = useState<string | null>(null);

//   const [createForm, setCreateForm] = useState({
//     parentType: "BID" as "BID" | "PROJECT",
//     parentId: state.projects.find((project) => project.type === "BID")?.id || state.projects[0]?.id || "",
//     title: "",
//     category: workRequestTypes[0] || "General",
//     priority: "High" as "High" | "Medium" | "Low",
//     attachmentName: "",
//     attachmentCategory: projectInfoCategories[0] || "General",
//     notes: "",
//     assignedDivisionId: "div-ecm",
//   });

//   const [leaderChoice, setLeaderChoice] = useState("");
//   const [memberChoice, setMemberChoice] = useState("");
//   const [tmsChoice, setTmsChoice] = useState({
//     drawingId: "member-tms-m1",
//     checkingId: "member-tms-m2",
//     approvalId: "member-tms-m3",
//   });
//   const [drawingDocName, setDrawingDocName] = useState("");
//   const [reviewNote, setReviewNote] = useState("");
//   const [uploadDoc, setUploadDoc] = useState<DocumentFormRow>(createEmptyDocumentRow(state.settings.categories[0] || "General"));
//   const [actionDoc, setActionDoc] = useState<DocumentFormRow>(createEmptyDocumentRow(state.settings.categories[0] || "General"));
//   const [listDocForm, setListDocForm] = useState({ name: "", category: state.settings.categories[0] || "General" });
//   const [showListDialog, setShowListDialog] = useState<string | null>(null);

//   // const availableParents = useMemo(() => {
//   //   if (createForm.parentType === "BID") {
//   //     return state.projects.filter((project) => project.type === "BID");
//   //   }
//   //   return state.projects.filter((project) => project.type === "PROJECT" && project.status === "ACTIVE");
//   // }, [createForm.parentType, state.projects]);
// const availableParents = useMemo(() => {
//   if (createForm.parentType === "BID") {
//     return state.projects.filter((project) => {
//       const alreadyHasWorkRequest = state.workRequests.some((request) => request.parentId === project.id);
//       return project.type === "BID" && !alreadyHasWorkRequest;
//     });
//   }

//   return state.projects.filter((project) => project.type === "PROJECT" && project.status === "ACTIVE");
// }, [createForm.parentType, state.projects, state.workRequests]);
//   useEffect(() => {
//     if (!availableParents.length) {
//       setCreateForm((prev) => ({ ...prev, parentId: "" }));
//       return;
//     }

//     if (!availableParents.some((project) => project.id === createForm.parentId)) {
//       setCreateForm((prev) => ({ ...prev, parentId: availableParents[0]?.id || "" }));
//     }
//   }, [availableParents, createForm.parentId]);

//   const getCurrentMember = () => {
//     if (!currentActor.memberId) return undefined;
//     return state.members.find((member) => member.id === currentActor.memberId);
//   };

//   const isDivisionLeadFor = (member: Member | undefined, divisionId?: string) => {
//     if (!member || !divisionId) return false;
//     return member.divisionId === divisionId && /lead|manager|leader/i.test(member.roleTitle);
//   };

//   const isWorkflowSupervisor = currentActor.role === "system_admin" || currentActor.role === "prime_consultant";

//   const canPerformAction = (request: WorkRequest, action: WorkflowAction) => {
//     const member = getCurrentMember();

//     switch (action) {
//       case "ASSIGN_LEADER":
//         return (
//           request.currentStatus === "DIVISION_NOTIFIED" &&
//           (isWorkflowSupervisor || (currentActor.role === "division_lead" && isDivisionLeadFor(member, request.assignedDivisionId)))
//         );

//       case "ASSIGN_MEMBER":
//         return (
//           request.currentStatus === "LEADER_ASSIGNED" &&
//           (isWorkflowSupervisor || (currentActor.role === "division_lead" && isDivisionLeadFor(member, request.assignedDivisionId)))
//         );

//       case "FORWARD_TO_TMS":
//         return (
//           request.currentStatus === "MEMBER_REVIEW" &&
//           (isWorkflowSupervisor || (currentActor.role === "division_member" && currentActor.memberId === request.assignedMemberId))
//         );

//       case "ASSIGN_TMS_CHAIN":
//         return request.currentStatus === "FORWARDED_TO_TMS" && (isWorkflowSupervisor || currentActor.role === "tms_manager");

//       case "SUBMIT_DRAWING":
//         return (
//           (request.currentStatus === "TMS_ASSIGNED" || request.currentStatus === "DRAWING_IN_PROGRESS") &&
//           (isWorkflowSupervisor || (currentActor.role === "tms_drawing" && currentActor.memberId === request.tmsAssignments?.drawingId))
//         );

//       case "CHECKING_APPROVE_REJECT":
//         return (
//           request.currentStatus === "CHECKING_REVIEW" &&
//           (isWorkflowSupervisor || (currentActor.role === "tms_checking" && currentActor.memberId === request.tmsAssignments?.checkingId))
//         );

//       case "APPROVAL_APPROVE_REJECT":
//         return (
//           request.currentStatus === "APPROVAL_REVIEW" &&
//           (isWorkflowSupervisor || (currentActor.role === "tms_approval" && currentActor.memberId === request.tmsAssignments?.approvalId))
//         );

//       case "DIVISION_MEMBER_REVIEW":
//         return (
//           request.currentStatus === "RETURNED_TO_DIVISION" &&
//           (isWorkflowSupervisor || (currentActor.role === "division_member" && currentActor.memberId === request.assignedMemberId))
//         );

//       case "DIVISION_MANAGER_APPROVE":
//         return (
//           request.currentStatus === "DIVISION_MEMBER_APPROVED" &&
//           (isWorkflowSupervisor || (currentActor.role === "division_lead" && isDivisionLeadFor(member, request.originDivisionId)))
//         );

//       case "FORWARD_TO_CCR":
//         return (
//           request.currentStatus === "DIVISION_MANAGER_APPROVED" &&
//           (isWorkflowSupervisor || (currentActor.role === "division_lead" && isDivisionLeadFor(member, request.originDivisionId)))
//         );

//       case "FINAL_LIST":
//         return request.currentStatus === "FORWARDED_TO_CCR" && (isWorkflowSupervisor || currentActor.role === "ccr_coordinator");

//       default:
//         return false;
//     }
//   };

//   const hasWorkflowAction = (request: WorkRequest) => {
//     const actions: WorkflowAction[] = [
//       "ASSIGN_LEADER",
//       "ASSIGN_MEMBER",
//       "FORWARD_TO_TMS",
//       "ASSIGN_TMS_CHAIN",
//       "SUBMIT_DRAWING",
//       "CHECKING_APPROVE_REJECT",
//       "APPROVAL_APPROVE_REJECT",
//       "DIVISION_MEMBER_REVIEW",
//       "DIVISION_MANAGER_APPROVE",
//       "FORWARD_TO_CCR",
//       "FINAL_LIST",
//     ];

//     return actions.some((action) => canPerformAction(request, action));
//   };

//   const visibleRequests = useMemo(() => {
//     const q = search.toLowerCase();

//     return state.workRequests.filter((request) => {
//       const member = currentActor.memberId ? state.members.find((item) => item.id === currentActor.memberId) : undefined;

//       const belongsByRole = (() => {
//         switch (currentActor.role) {
//           case "system_admin":
//           case "prime_consultant":
//           case "ccr_coordinator":
//             return true;

//           case "client_owner": {
//             const parent = state.projects.find((project) => project.id === request.parentId);
//             return parent?.clientId === currentActor.clientId;
//           }

//           case "division_lead":
//             return member?.divisionId === request.assignedDivisionId || member?.divisionId === request.originDivisionId;

//           case "division_member":
//             return request.assignedMemberId === currentActor.memberId || member?.divisionId === request.originDivisionId || member?.divisionId === request.assignedDivisionId;

//           case "tms_manager":
//             return ["FORWARDED_TO_TMS", "TMS_ASSIGNED", "DRAWING_IN_PROGRESS", "CHECKING_REVIEW", "APPROVAL_REVIEW"].includes(request.currentStatus);

//           case "tms_drawing":
//             return request.tmsAssignments?.drawingId === currentActor.memberId;

//           case "tms_checking":
//             return request.tmsAssignments?.checkingId === currentActor.memberId;

//           case "tms_approval":
//             return request.tmsAssignments?.approvalId === currentActor.memberId;

//           default:
//             return false;
//         }
//       })();

//       const matches = !q || request.title.toLowerCase().includes(q) || request.code.toLowerCase().includes(q);
//       return belongsByRole && matches;
//     });
//   }, [currentActor.clientId, currentActor.memberId, currentActor.role, search, state.members, state.projects, state.workRequests]);

//   const canCreate = actorCanCreateWorkRequests(currentActor.role);
//   const selectedParent = state.projects.find((project) => project.id === createForm.parentId);
//   const detailRequest = state.workRequests.find((request) => request.id === detailRequestId);
//   const uploadRequest = state.workRequests.find((request) => request.id === uploadRequestId);
//   const historyRequest = state.workRequests.find((request) => request.id === historyRequestId);
//   const actionRequest = state.workRequests.find((request) => request.id === actionRequestId);

//   const getLeaderOptions = (divisionId: string) =>
//     state.members.filter((member) => member.divisionId === divisionId && /lead|manager|leader/i.test(member.roleTitle));

//   const getMemberOptions = (divisionId: string) =>
//     state.members.filter((member) => member.divisionId === divisionId && !/manager|leader/i.test(member.roleTitle));

//   const getMemberName = (memberId?: string) => state.members.find((member) => member.id === memberId)?.name || "—";
//   const getDivision = (divisionId?: string) => state.divisions.find((division) => division.id === divisionId);
//   const getProject = (projectId?: string) => state.projects.find((project) => project.id === projectId);

//   const getCurrentHandler = (request: WorkRequest) => {
//     if (request.currentStatus === "HML_LISTED") return "HML Registry";
//     if (request.currentStatus === "FORWARDED_TO_CCR") return "CCR";

//     if (["FORWARDED_TO_TMS", "TMS_ASSIGNED", "DRAWING_IN_PROGRESS", "CHECKING_REVIEW", "APPROVAL_REVIEW"].includes(request.currentStatus)) {
//       if (request.currentStatus === "CHECKING_REVIEW") return getMemberName(request.tmsAssignments?.checkingId);
//       if (request.currentStatus === "APPROVAL_REVIEW") return getMemberName(request.tmsAssignments?.approvalId);
//       if (request.currentStatus === "DRAWING_IN_PROGRESS" || request.currentStatus === "TMS_ASSIGNED") return getMemberName(request.tmsAssignments?.drawingId) || "TMS";
//       return "TMS Manager";
//     }

//     if (request.currentStatus === "MEMBER_REVIEW") return getMemberName(request.assignedMemberId);
//     if (request.currentStatus === "LEADER_ASSIGNED") return getMemberName(request.assignedLeaderId);
//     return getDivision(request.assignedDivisionId)?.abbr || "—";
//   };

//   const openActionModal = (request: WorkRequest) => {
//     setActionDoc(createEmptyDocumentRow(state.settings.categories[0] || "General", getDefaultActionUploadStage(request.currentStatus)));
//     setActionRequestId(request.id);
//   };

//   const handleCreate = () => {
//     if (!createForm.title.trim()) return toast.error("Work request title is required");
//     if (!createForm.parentId) return toast.error("A parent Bid/Project is required before creating a work request");

//     addWorkRequest(createForm);
//     toast.success("Work request created and routed to division");
//     setShowCreate(false);
//     setCreateForm({
//       parentType: "BID",
//       parentId: state.projects.find((project) => project.type === "BID")?.id || state.projects[0]?.id || "",
//       title: "",
//       category: workRequestTypes[0] || "General",
//       priority: "High",
//       attachmentName: "",
//       attachmentCategory: projectInfoCategories[0] || "General",
//       notes: "",
//       assignedDivisionId: "div-ecm",
//     });
//   };

//   const handleUploadFileChange = async (file?: File) => {
//     if (!file) return;

//     try {
//       const fileDataUrl = await readFileAsDataUrl(file);
//       setUploadDoc((prev) => ({
//         ...prev,
//         name: file.name,
//         fileName: file.name,
//         fileType: file.type || "application/octet-stream",
//         fileSize: file.size,
//         fileDataUrl,
//       }));
//     } catch {
//       toast.error("Could not read selected file");
//     }
//   };

//   const handleActionFileChange = async (file?: File) => {
//     if (!file) return;

//     try {
//       const fileDataUrl = await readFileAsDataUrl(file);
//       setActionDoc((prev) => ({
//         ...prev,
//         name: file.name,
//         fileName: file.name,
//         fileType: file.type || "application/octet-stream",
//         fileSize: file.size,
//         fileDataUrl,
//       }));
//     } catch {
//       toast.error("Could not read selected file");
//     }
//   };

//   const uploadUpdatedDocument = (request: WorkRequest) => {
//     const normalized = normalizeDocument(uploadDoc);
//     if (!normalized) return toast.error("Add text content or upload a file before submitting");

//     addWorkRequestDocument(request.id, normalized);
//     toast.success("Document uploaded", {
//       description: "The document name is auto-set from the uploaded file. Duplicate file names are saved as a new version.",
//     });

//     setUploadDoc(createEmptyDocumentRow(state.settings.categories[0] || "General"));
//     setUploadRequestId(null);
//   };

//   const uploadOptionalActionDocument = (request: WorkRequest, fallbackStage: string) => {
//     const normalized = normalizeDocument({
//       ...actionDoc,
//       workflowStage: actionDoc.workflowStage || fallbackStage,
//     });

//     if (!normalized) return false;

//     addWorkRequestDocument(request.id, normalized);
//     setActionDoc(createEmptyDocumentRow(state.settings.categories[0] || "General", fallbackStage));
//     return true;
//   };

//   const runWorkflowAction = (request: WorkRequest, message: string, fallbackStage: string, action: () => void) => {
//     const attached = uploadOptionalActionDocument(request, fallbackStage);
//     action();
//     setReviewNote("");
//     toast.success(message, {
//       description: attached ? "Optional document was attached. Same file names are saved as a new version." : undefined,
//     });
//   };

//   const openFinalListingFromAction = (request: WorkRequest) => {
//     uploadOptionalActionDocument(request, "HML Registry");
//     setListDocForm({
//       name: request.drawingDocumentName || `${request.title} Final`,
//       category: request.attachmentCategory,
//     });
//     setShowListDialog(request.id);
//   };

//   const renderAutoNamePreview = (doc: DocumentFormRow) => {
//     const name = autoDocumentName(doc);

//     if (name) {
//       return (
//         <div className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground">
//           {name}
//         </div>
//       );
//     }

//     return (
//       <div className="rounded-lg border border-dashed border-border bg-background px-3 py-2 text-sm text-muted-foreground">
//         File name will be used automatically after upload. Text-only documents will get an automatic timestamp name.
//       </div>
//     );
//   };

//   const renderOptionalActionUploadFields = () => (
//     <div className="rounded-xl border border-border bg-muted/20 p-4">
//       <div className="mb-3">
//         <h4 className="text-sm font-semibold text-card-foreground">Optional File Attachment for This Action</h4>
//         <p className="text-xs text-muted-foreground">
//           Upload any file type or add a text document. File name is set automatically from the uploaded file. Same file name becomes next version.
//         </p>
//       </div>

//       <div className="grid gap-3 md:grid-cols-2">
//         <div className="md:col-span-2">
//           <label className="mb-1 block text-xs font-medium text-muted-foreground">Document Name</label>
//           {renderAutoNamePreview(actionDoc)}
//         </div>

//         <div>
//           <label className="mb-1 block text-xs font-medium text-muted-foreground">Category</label>
//           <select
//             value={actionDoc.category}
//             onChange={(event) => setActionDoc((prev) => ({ ...prev, category: event.target.value }))}
//             className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
//           >
//             {state.settings.categories.map((category) => (
//               <option key={category} value={category}>
//                 {category}
//               </option>
//             ))}
//           </select>
//         </div>

//         <div>
//           <label className="mb-1 block text-xs font-medium text-muted-foreground">Workflow Stage</label>
//           <select
//             value={actionDoc.workflowStage || "Workflow Collaboration"}
//             onChange={(event) => setActionDoc((prev) => ({ ...prev, workflowStage: event.target.value }))}
//             className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
//           >
//             {workflowUploadStages.map((stage) => (
//               <option key={stage} value={stage}>
//                 {stage}
//               </option>
//             ))}
//           </select>
//         </div>

//         <div className="md:col-span-2">
//           <label className="mb-1 block text-xs font-medium text-muted-foreground">Upload File</label>
//           <input
//             type="file"
//             onChange={(event) => void handleActionFileChange(event.target.files?.[0])}
//             className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1 file:text-xs file:font-medium"
//           />
//           {actionDoc.fileName ? (
//             <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
//               <Paperclip className="h-3 w-3" /> {actionDoc.fileName} · {formatFileSize(actionDoc.fileSize)}
//             </p>
//           ) : null}
//         </div>

//         <div className="md:col-span-2">
//           <label className="mb-1 block text-xs font-medium text-muted-foreground">Text Document</label>
//           <textarea
//             value={actionDoc.textContent || ""}
//             onChange={(event) => setActionDoc((prev) => ({ ...prev, textContent: event.target.value }))}
//             placeholder="Write or paste text document here. Name will be generated automatically if no file is uploaded."
//             rows={3}
//             className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
//           />
//         </div>

//         <div className="md:col-span-2">
//           <label className="mb-1 block text-xs font-medium text-muted-foreground">Attachment Note</label>
//           <input
//             value={actionDoc.note || ""}
//             onChange={(event) => setActionDoc((prev) => ({ ...prev, note: event.target.value }))}
//             placeholder="Optional file note"
//             className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
//           />
//         </div>
//       </div>
//     </div>
//   );

//   const renderActionPanel = (request: WorkRequest) => {
//     const leaderOptions = getLeaderOptions(request.assignedDivisionId);
//     const memberOptions = getMemberOptions(request.assignedDivisionId);

//     const canAssignLeader = canPerformAction(request, "ASSIGN_LEADER");
//     const canAssignMember = canPerformAction(request, "ASSIGN_MEMBER");
//     const canForward = canPerformAction(request, "FORWARD_TO_TMS");
//     const canAssignTms = canPerformAction(request, "ASSIGN_TMS_CHAIN");
//     const canSubmitDrawing = canPerformAction(request, "SUBMIT_DRAWING");
//     const canCheck = canPerformAction(request, "CHECKING_APPROVE_REJECT");
//     const canApprove = canPerformAction(request, "APPROVAL_APPROVE_REJECT");
//     const canOriginMember = canPerformAction(request, "DIVISION_MEMBER_REVIEW");
//     const canOriginManager = canPerformAction(request, "DIVISION_MANAGER_APPROVE");
//     const canForwardToCcr = canPerformAction(request, "FORWARD_TO_CCR");
//     const canList = canPerformAction(request, "FINAL_LIST");

//     const hasActions =
//       canAssignLeader ||
//       canAssignMember ||
//       canForward ||
//       canAssignTms ||
//       canSubmitDrawing ||
//       canCheck ||
//       canApprove ||
//       canOriginMember ||
//       canOriginManager ||
//       canForwardToCcr ||
//       canList;

//     if (!hasActions) {
//       return (
//         <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
//           No workflow action is available for your current role at this stage.
//         </div>
//       );
//     }

//     return (
//       <div className="grid gap-4 md:grid-cols-2">
//         {canAssignLeader && (
//           <div className="space-y-3 rounded-xl border border-border bg-background p-4">
//             <h4 className="text-sm font-semibold text-card-foreground">Assign Division Lead</h4>
//             <select
//               value={leaderChoice}
//               onChange={(event) => setLeaderChoice(event.target.value)}
//               className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
//             >
//               <option value="">Select lead</option>
//               {leaderOptions.map((member) => (
//                 <option key={member.id} value={member.id}>
//                   {member.name}
//                 </option>
//               ))}
//             </select>
//             <Button
//               className="w-full"
//               onClick={() => {
//                 if (!leaderChoice) return toast.error("Select a division lead first");
//                 runWorkflowAction(request, "Division lead assigned", "ECM / PMO Review", () => assignLeader(request.id, leaderChoice));
//                 setLeaderChoice("");
//               }}
//             >
//               Assign Lead
//             </Button>
//           </div>
//         )}

//         {canAssignMember && (
//           <div className="space-y-3 rounded-xl border border-border bg-background p-4">
//             <h4 className="text-sm font-semibold text-card-foreground">Assign Member</h4>
//             <select
//               value={memberChoice}
//               onChange={(event) => setMemberChoice(event.target.value)}
//               className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
//             >
//               <option value="">Select member</option>
//               {memberOptions.map((member) => (
//                 <option key={member.id} value={member.id}>
//                   {member.name}
//                 </option>
//               ))}
//             </select>
//             <Button
//               className="w-full"
//               onClick={() => {
//                 if (!memberChoice) return toast.error("Select a member first");
//                 runWorkflowAction(request, "Member assigned", "ECM / PMO Review", () => assignMember(request.id, memberChoice));
//                 setMemberChoice("");
//               }}
//             >
//               Assign Member
//             </Button>
//           </div>
//         )}

//         {canForward && (
//           <div className="space-y-3 rounded-xl border border-border bg-background p-4">
//             <h4 className="text-sm font-semibold text-card-foreground">Forward to TMS</h4>
//             <textarea
//               value={reviewNote}
//               onChange={(event) => setReviewNote(event.target.value)}
//               placeholder="Forwarding note"
//               className="h-24 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
//             />
//             <Button className="w-full" onClick={() => runWorkflowAction(request, "Forwarded to TMS", "TMS Manager Assignment", () => forwardToTms(request.id, reviewNote))}>
//               <Send className="h-4 w-4" />
//               Forward to TMS
//             </Button>
//           </div>
//         )}

//         {canAssignTms && (
//           <div className="space-y-3 rounded-xl border border-border bg-background p-4">
//             <h4 className="text-sm font-semibold text-card-foreground">Assign TMS Roles</h4>
//             <select
//               value={tmsChoice.drawingId}
//               onChange={(event) => setTmsChoice((prev) => ({ ...prev, drawingId: event.target.value }))}
//               className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
//             >
//               {state.members
//                 .filter((member) => member.divisionId === "div-tms-eng")
//                 .map((member) => (
//                   <option key={member.id} value={member.id}>
//                     Drawing — {member.name}
//                   </option>
//                 ))}
//             </select>

//             <select
//               value={tmsChoice.checkingId}
//               onChange={(event) => setTmsChoice((prev) => ({ ...prev, checkingId: event.target.value }))}
//               className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
//             >
//               {state.members
//                 .filter((member) => member.divisionId === "div-tms-eng")
//                 .map((member) => (
//                   <option key={member.id} value={member.id}>
//                     Checking — {member.name}
//                   </option>
//                 ))}
//             </select>

//             <select
//               value={tmsChoice.approvalId}
//               onChange={(event) => setTmsChoice((prev) => ({ ...prev, approvalId: event.target.value }))}
//               className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
//             >
//               {state.members
//                 .filter((member) => member.divisionId === "div-tms-eng")
//                 .map((member) => (
//                   <option key={member.id} value={member.id}>
//                     Approval — {member.name}
//                   </option>
//                 ))}
//             </select>

//             <Button className="w-full" onClick={() => runWorkflowAction(request, "TMS chain assigned", "TMS Manager Assignment", () => assignTmsChain(request.id, tmsChoice))}>
//               Assign TMS Chain
//             </Button>
//           </div>
//         )}

//         {canSubmitDrawing && (
//           <div className="space-y-3 rounded-xl border border-border bg-background p-4">
//             <h4 className="text-sm font-semibold text-card-foreground">Submit Drawing - M1</h4>
//             <input
//               value={drawingDocName}
//               onChange={(event) => setDrawingDocName(event.target.value)}
//               placeholder="Drawing output package name"
//               className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
//             />
//             <Button
//               className="w-full"
//               onClick={() => {
//                 if (!drawingDocName.trim()) return toast.error("Drawing document name is required");
//                 runWorkflowAction(request, "Drawing submitted", "TMS Drawing - M1", () => submitDrawing(request.id, drawingDocName.trim()));
//                 setDrawingDocName("");
//               }}
//             >
//               Submit Drawing
//             </Button>
//           </div>
//         )}

//         {canCheck && (
//           <div className="space-y-3 rounded-xl border border-border bg-background p-4">
//             <h4 className="text-sm font-semibold text-card-foreground">Checking Review - M2</h4>
//             <textarea
//               value={reviewNote}
//               onChange={(event) => setReviewNote(event.target.value)}
//               placeholder="Checking note"
//               className="h-24 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
//             />
//             <div className="flex gap-2">
//               <Button className="flex-1" onClick={() => runWorkflowAction(request, "Checking approved", "TMS Checking - M2", () => reviewChecking(request.id, true, reviewNote))}>
//                 <CheckCircle2 className="h-4 w-4" />
//                 Approve
//               </Button>
//               <Button
//                 variant="destructive"
//                 className="flex-1"
//                 onClick={() => runWorkflowAction(request, "Checking rejected and returned to drawing", "TMS Checking - M2", () => reviewChecking(request.id, false, reviewNote))}
//               >
//                 <XCircle className="h-4 w-4" />
//                 Backward
//               </Button>
//             </div>
//           </div>
//         )}

//         {canApprove && (
//           <div className="space-y-3 rounded-xl border border-border bg-background p-4">
//             <h4 className="text-sm font-semibold text-card-foreground">TMS Approval - M3</h4>
//             <textarea
//               value={reviewNote}
//               onChange={(event) => setReviewNote(event.target.value)}
//               placeholder="Approval note"
//               className="h-24 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
//             />
//             <div className="flex gap-2">
//               <Button className="flex-1" onClick={() => runWorkflowAction(request, "TMS approved and returned to division", "TMS Approval - M3", () => reviewApproval(request.id, true, reviewNote))}>
//                 <CheckCircle2 className="h-4 w-4" />
//                 Approve
//               </Button>
//               <Button
//                 variant="destructive"
//                 className="flex-1"
//                 onClick={() => runWorkflowAction(request, "TMS approval rejected and returned to drawing", "TMS Approval - M3", () => reviewApproval(request.id, false, reviewNote))}
//               >
//                 <XCircle className="h-4 w-4" />
//                 Backward
//               </Button>
//             </div>
//           </div>
//         )}

//         {canOriginMember && (
//           <div className="space-y-3 rounded-xl border border-border bg-background p-4">
//             <h4 className="text-sm font-semibold text-card-foreground">Division Member Review</h4>
//             <textarea
//               value={reviewNote}
//               onChange={(event) => setReviewNote(event.target.value)}
//               placeholder="Review note"
//               className="h-24 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
//             />
//             <div className="flex gap-2">
//               <Button className="flex-1" onClick={() => runWorkflowAction(request, "Division member approved", "Division Final Review", () => originMemberDecision(request.id, true, reviewNote))}>
//                 <CheckCircle2 className="h-4 w-4" />
//                 Approve
//               </Button>
//               <Button
//                 variant="destructive"
//                 className="flex-1"
//                 onClick={() => runWorkflowAction(request, "Returned back to TMS", "Division Final Review", () => originMemberDecision(request.id, false, reviewNote))}
//               >
//                 <XCircle className="h-4 w-4" />
//                 Backward
//               </Button>
//             </div>
//           </div>
//         )}

//         {canOriginManager && (
//           <div className="space-y-3 rounded-xl border border-border bg-background p-4">
//             <h4 className="text-sm font-semibold text-card-foreground">Division Manager Approval</h4>
//             <textarea
//               value={reviewNote}
//               onChange={(event) => setReviewNote(event.target.value)}
//               placeholder="Manager note"
//               className="h-24 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
//             />
//             <Button className="w-full" onClick={() => runWorkflowAction(request, "Division manager approved", "Division Final Review", () => originManagerApprove(request.id, reviewNote))}>
//               <CheckCircle2 className="h-4 w-4" />
//               Approve as Manager
//             </Button>
//           </div>
//         )}

//         {canForwardToCcr && (
//           <div className="space-y-3 rounded-xl border border-border bg-background p-4">
//             <h4 className="text-sm font-semibold text-card-foreground">Forward to CCR</h4>
//             <textarea
//               value={reviewNote}
//               onChange={(event) => setReviewNote(event.target.value)}
//               placeholder="Forwarding note"
//               className="h-24 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
//             />
//             <Button className="w-full" onClick={() => runWorkflowAction(request, "Forwarded to CCR", "CCR Closeout", () => forwardToCcr(request.id, reviewNote))}>
//               <Send className="h-4 w-4" />
//               Forward to CCR
//             </Button>
//           </div>
//         )}

//         {canList && (
//           <div className="space-y-3 rounded-xl border border-border bg-background p-4">
//             <h4 className="text-sm font-semibold text-card-foreground">Merge / Final HML Listing</h4>
//             <Button className="w-full" onClick={() => openFinalListingFromAction(request)}>
//               <GitMerge className="h-4 w-4" />
//               Merge Final Document
//             </Button>
//           </div>
//         )}
//       </div>
//     );
//   };

//   return (
//     <div>
//       <PageHeader
//         title="Work Requests"
//         description="Track and manage work requests across divisions"
//         actions={
//           canCreate ? (
//             <Button onClick={() => setShowCreate(true)}>
//               <Plus className="h-4 w-4" /> New Work Request
//             </Button>
//           ) : undefined
//         }
//       />

//       <div className="mb-4 flex items-center gap-3">
//         <div className="relative flex-1 max-w-sm">
//           <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
//           <input
//             type="text"
//             placeholder="Search work requests..."
//             value={search}
//             onChange={(event) => setSearch(event.target.value)}
//             className="w-full rounded-lg border border-input bg-background py-2 pl-9 pr-4 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
//           />
//         </div>
//       </div>

//       <div className="space-y-3">
//         {visibleRequests.map((request) => {
//           const division = getDivision(request.assignedDivisionId);
//           const parent = getProject(request.parentId);
//           const isExpanded = expandedId === request.id;
//           const currentHandler = getCurrentHandler(request);

//           return (
//             <div key={request.id} className="overflow-hidden rounded-xl border border-border bg-card">
//               <button
//                 type="button"
//                 onClick={() => setExpandedId(isExpanded ? null : request.id)}
//                 className="flex w-full flex-col gap-4 px-5 py-4 text-left transition-colors hover:bg-muted/25 lg:flex-row lg:items-center lg:justify-between"
//               >
//                 <div>
//                   <div className="flex flex-wrap items-center gap-2">
//                     <span className="font-mono text-xs text-muted-foreground">{request.code}</span>
//                     <StatusBadge status={statusToSimple(request.currentStatus)} />
//                     <span className="text-xs font-medium text-muted-foreground">{requestStageLabel(request.currentStatus)}</span>
//                     <span className={`text-xs font-semibold ${priorityClass(request.priority)}`}>{request.priority}</span>
//                     <span className="inline-flex items-center rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
//                       {request.parentType === "BID" ? "Bid" : "Project"}
//                     </span>
//                   </div>
//                   <h3 className="mt-2 text-sm font-semibold text-card-foreground">{request.title}</h3>
//                 </div>

//                 <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground lg:justify-end">
//                   <span>{parent?.code || "No parent"}</span>
//                   <span>{division?.abbr || "—"}</span>
//                   <span>{currentHandler}</span>
//                   {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
//                 </div>
//               </button>

//               {isExpanded ? (
//                 <div className="border-t border-border px-5 py-4">
//                   <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Workflow Progress</p>

//                   <div className="overflow-x-auto pb-2">
//                     <div className="min-w-[1500px]">
//                       <WorkflowTimeline steps={getWorkflowSteps(request, division?.abbr || "ECM")} />
//                     </div>
//                   </div>

//                   <div className="mt-5 flex flex-wrap gap-2">
//                     <Button variant="outline" size="sm" onClick={() => setDetailRequestId(request.id)}>
//                       <Eye className="h-4 w-4" /> Details
//                     </Button>

//                     <Button variant="outline" size="sm" onClick={() => setHistoryRequestId(request.id)}>
//                       <History className="h-4 w-4" /> History ({request.revisionHistory.length})
//                     </Button>

//                     <Button variant="outline" size="sm" onClick={() => setUploadRequestId(request.id)}>
//                       <Upload className="h-4 w-4" /> Upload File
//                     </Button>

//                     {hasWorkflowAction(request) ? (
//                       <Button size="sm" onClick={() => openActionModal(request)}>
//                         <Send className="h-4 w-4" /> Workflow Action
//                       </Button>
//                     ) : null}
//                   </div>
//                 </div>
//               ) : null}
//             </div>
//           );
//         })}

//         {!visibleRequests.length && (
//           <div className="rounded-xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
//             No visible work requests for the current actor.
//           </div>
//         )}
//       </div>

//       <Dialog open={showCreate} onOpenChange={setShowCreate}>
//         <DialogContent className="max-w-3xl">
//           <DialogHeader>
//             <DialogTitle>Create Work Request</DialogTitle>
//           </DialogHeader>

//           <div className="space-y-4 py-2">
//             <div>
//               <p className="mb-2 text-sm font-medium text-foreground">Parent Type</p>
//               <div className="flex gap-4">
//                 <label className="flex items-center gap-2 text-sm text-foreground">
//                   <input
//                     type="radio"
//                     checked={createForm.parentType === "BID"}
//                     onChange={() =>
//                       setCreateForm((prev) => ({
//                         ...prev,
//                         parentType: "BID",
//                         parentId: state.projects.find((project) => project.type === "BID")?.id || "",
//                       }))
//                     }
//                   />
//                   Bid
//                 </label>
//                 <label className="flex items-center gap-2 text-sm text-foreground">
//                   <input
//                     type="radio"
//                     checked={createForm.parentType === "PROJECT"}
//                     onChange={() =>
//                       setCreateForm((prev) => ({
//                         ...prev,
//                         parentType: "PROJECT",
//                         parentId: state.projects.find((project) => project.type === "PROJECT" && project.status === "ACTIVE")?.id || "",
//                       }))
//                     }
//                   />
//                   Project
//                 </label>
//               </div>
//             </div>

//             <div className="grid gap-4 md:grid-cols-2">
//               <div>
//                 <label className="mb-1 block text-sm font-medium text-foreground">Select {createForm.parentType}</label>
//                 <select
//                   value={createForm.parentId}
//                   onChange={(event) => setCreateForm((prev) => ({ ...prev, parentId: event.target.value }))}
//                   className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
//                 >
//                   <option value="">Choose</option>
//                   {availableParents.length ? (
//                     availableParents.map((project) => (
//                       <option key={project.id} value={project.id}>
//                         {getProjectLabel(project)}
//                       </option>
//                     ))
//                   ) : (
//                     <option value="">No eligible parent available</option>
//                   )}
//                 </select>

//                 {selectedParent ? (
//                   <p className="mt-2 text-xs text-muted-foreground">
//                     Selected parent: <span className="font-medium text-card-foreground">{getProjectLabel(selectedParent)}</span>
//                   </p>
//                 ) : (
//                   <p className="mt-2 text-xs text-muted-foreground">
//                     Create a Bid or an active Project first, then create the work request under it.
//                   </p>
//                 )}
//               </div>

//               <div>
//                 <label className="mb-1 block text-sm font-medium text-foreground">Assigned Division</label>
//                 <select
//                   value={createForm.assignedDivisionId}
//                   onChange={(event) => setCreateForm((prev) => ({ ...prev, assignedDivisionId: event.target.value }))}
//                   className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
//                 >
//                   {state.divisions
//                     .filter((division) => ["div-ecm", "div-pmo"].includes(division.id))
//                     .map((division) => (
//                       <option key={division.id} value={division.id}>
//                         {division.abbr} — {division.name}
//                       </option>
//                     ))}
//                 </select>
//               </div>

//               <div>
//                 <label className="mb-1 block text-sm font-medium text-foreground">Title</label>
//                 <input
//                   value={createForm.title}
//                   onChange={(event) => setCreateForm((prev) => ({ ...prev, title: event.target.value }))}
//                   className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
//                 />
//               </div>

//               <div>
//                 <label className="mb-1 block text-sm font-medium text-foreground">Category</label>
//                 <select
//                   value={createForm.category}
//                   onChange={(event) => setCreateForm((prev) => ({ ...prev, category: event.target.value }))}
//                   className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
//                 >
//                   {state.settings.categories.map((category) => (
//                     <option key={category} value={category}>
//                       {category}
//                     </option>
//                   ))}
//                 </select>
//               </div>

//               <div>
//                 <label className="mb-1 block text-sm font-medium text-foreground">Attachment Name</label>
//                 <input
//                   value={createForm.attachmentName}
//                   onChange={(event) => setCreateForm((prev) => ({ ...prev, attachmentName: event.target.value }))}
//                   className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
//                 />
//               </div>

//               <div>
//                 <label className="mb-1 block text-sm font-medium text-foreground">Attachment Category</label>
//                 <select
//                   value={createForm.attachmentCategory}
//                   onChange={(event) => setCreateForm((prev) => ({ ...prev, attachmentCategory: event.target.value }))}
//                   className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
//                 >
//                   {state.settings.categories.map((category) => (
//                     <option key={category} value={category}>
//                       {category}
//                     </option>
//                   ))}
//                 </select>
//               </div>

//               <div>
//                 <label className="mb-1 block text-sm font-medium text-foreground">Priority</label>
//                 <select
//                   value={createForm.priority}
//                   onChange={(event) => setCreateForm((prev) => ({ ...prev, priority: event.target.value as "High" | "Medium" | "Low" }))}
//                   className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
//                 >
//                   <option value="High">High</option>
//                   <option value="Medium">Medium</option>
//                   <option value="Low">Low</option>
//                 </select>
//               </div>

//               <div className="md:col-span-2">
//                 <label className="mb-1 block text-sm font-medium text-foreground">Notes</label>
//                 <textarea
//                   value={createForm.notes}
//                   onChange={(event) => setCreateForm((prev) => ({ ...prev, notes: event.target.value }))}
//                   className="h-24 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
//                 />
//               </div>
//             </div>
//           </div>

//           <DialogFooter>
//             <Button variant="outline" onClick={() => setShowCreate(false)}>
//               Cancel
//             </Button>
//             <Button onClick={handleCreate}>Create Work Request</Button>
//           </DialogFooter>
//         </DialogContent>
//       </Dialog>

//       <Dialog open={!!detailRequest} onOpenChange={() => setDetailRequestId(null)}>
//         <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
//           <DialogHeader>
//             <DialogTitle>Work Request Details</DialogTitle>
//           </DialogHeader>

//           {detailRequest
//             ? (() => {
//                 const parent = getProject(detailRequest.parentId);
//                 const division = getDivision(detailRequest.assignedDivisionId);

//                 return (
//                   <div className="space-y-5 py-2">
//                     <div className="grid gap-3 rounded-xl border border-border bg-muted/20 p-4 text-sm md:grid-cols-4">
//                       <div>
//                         <p className="text-xs text-muted-foreground">Request</p>
//                         <p className="font-medium text-foreground">{detailRequest.code}</p>
//                       </div>
//                       <div>
//                         <p className="text-xs text-muted-foreground">Parent</p>
//                         <p className="font-medium text-foreground">{parent?.code || "—"}</p>
//                       </div>
//                       <div>
//                         <p className="text-xs text-muted-foreground">Division</p>
//                         <p className="font-medium text-foreground">{division?.abbr || "—"}</p>
//                       </div>
//                       <div>
//                         <p className="text-xs text-muted-foreground">Current Handler</p>
//                         <p className="font-medium text-foreground">{getCurrentHandler(detailRequest)}</p>
//                       </div>
//                       <div className="md:col-span-2">
//                         <p className="text-xs text-muted-foreground">Title</p>
//                         <p className="font-medium text-foreground">{detailRequest.title}</p>
//                       </div>
//                       <div>
//                         <p className="text-xs text-muted-foreground">Status</p>
//                         <p className="font-medium text-foreground">{getWorkRequestStatusLabel(detailRequest.currentStatus)}</p>
//                       </div>
//                       <div>
//                         <p className="text-xs text-muted-foreground">Priority</p>
//                         <p className={`font-medium ${priorityClass(detailRequest.priority)}`}>{detailRequest.priority}</p>
//                       </div>
//                       <div className="md:col-span-4">
//                         <p className="text-xs text-muted-foreground">Notes</p>
//                         <p className="font-medium text-foreground">{detailRequest.notes || "—"}</p>
//                       </div>
//                     </div>

//                     <div>
//                       <h4 className="text-sm font-semibold text-card-foreground">Previous / Current Files</h4>
//                       <p className="mt-1 text-xs text-muted-foreground">
//                         Authorized users can view and download existing files from this work request.
//                       </p>

//                       <div className="mt-3 space-y-3">
//                         {parent?.initialDocuments.length ? (
//                           parent.initialDocuments.map((doc) => (
//                             <div key={doc.id} className="rounded-xl border border-border bg-card p-4">
//                               <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
//                                 <div>
//                                   <div className="flex flex-wrap items-center gap-2">
//                                     <FileText className="h-4 w-4 text-muted-foreground" />
//                                     <p className="font-medium text-card-foreground">{doc.name}</p>
//                                     <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">v{doc.version || 1}</span>
//                                   </div>

//                                   <p className="mt-1 text-xs text-muted-foreground">
//                                     {doc.category} · {doc.workflowStage || "Workflow Collaboration"} · Uploaded by {doc.uploadedBy} · {formatDate(doc.uploadedAt)}
//                                   </p>

//                                   {doc.fileName ? (
//                                     <p className="mt-1 text-xs text-muted-foreground">
//                                       File: {doc.fileName} · {formatFileSize(doc.fileSize)}
//                                     </p>
//                                   ) : null}

//                                   {doc.textContent ? <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{doc.textContent}</p> : null}
//                                   {doc.note ? <p className="mt-2 text-xs text-muted-foreground">Note: {doc.note}</p> : null}
//                                 </div>

//                                 <Button variant="outline" size="sm" onClick={() => void downloadAttachment(doc)}>
//                                   <Download className="h-4 w-4" /> Download
//                                 </Button>
//                               </div>
//                             </div>
//                           ))
//                         ) : (
//                           <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
//                             No file has been uploaded under this parent yet.
//                           </div>
//                         )}
//                       </div>
//                     </div>
//                   </div>
//                 );
//               })()
//             : null}
//         </DialogContent>
//       </Dialog>

//       <Dialog
//         open={!!actionRequest}
//         onOpenChange={(open) => {
//           if (!open) {
//             setActionRequestId(null);
//             setActionDoc(createEmptyDocumentRow(state.settings.categories[0] || "General"));
//           }
//         }}
//       >
//         <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
//           <DialogHeader>
//             <DialogTitle>Workflow Action</DialogTitle>
//           </DialogHeader>

//           {actionRequest ? (
//             <div className="space-y-5 py-2">
//               <div className="grid gap-3 rounded-xl border border-border bg-muted/20 p-4 text-sm md:grid-cols-4">
//                 <div>
//                   <p className="text-xs text-muted-foreground">Request</p>
//                   <p className="font-medium text-foreground">{actionRequest.code}</p>
//                 </div>
//                 <div>
//                   <p className="text-xs text-muted-foreground">Title</p>
//                   <p className="font-medium text-foreground">{actionRequest.title}</p>
//                 </div>
//                 <div>
//                   <p className="text-xs text-muted-foreground">Status</p>
//                   <p className="font-medium text-foreground">{getWorkRequestStatusLabel(actionRequest.currentStatus)}</p>
//                 </div>
//                 <div>
//                   <p className="text-xs text-muted-foreground">Current Handler</p>
//                   <p className="font-medium text-foreground">{getCurrentHandler(actionRequest)}</p>
//                 </div>
//               </div>

//               {renderOptionalActionUploadFields()}

//               {renderActionPanel(actionRequest)}
//             </div>
//           ) : null}
//         </DialogContent>
//       </Dialog>

//       <Dialog open={!!uploadRequest} onOpenChange={() => setUploadRequestId(null)}>
//         <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
//           <DialogHeader>
//             <DialogTitle>Upload File</DialogTitle>
//           </DialogHeader>

//           {uploadRequest ? (
//             <div className="space-y-4 py-2">
//               <div className="rounded-xl border border-border bg-muted/20 p-4 text-sm">
//                 <div className="grid gap-3 md:grid-cols-3">
//                   <div>
//                     <p className="text-xs text-muted-foreground">Request</p>
//                     <p className="font-medium text-foreground">{uploadRequest.code}</p>
//                   </div>
//                   <div>
//                     <p className="text-xs text-muted-foreground">Title</p>
//                     <p className="font-medium text-foreground">{uploadRequest.title}</p>
//                   </div>
//                   <div>
//                     <p className="text-xs text-muted-foreground">Current Stage</p>
//                     <p className="font-medium text-foreground">{getWorkRequestStatusLabel(uploadRequest.currentStatus)}</p>
//                   </div>
//                 </div>
//               </div>

//               <div className="rounded-xl border border-border bg-muted/20 p-4">
//                 <div className="mb-3">
//                   <h4 className="text-sm font-semibold text-card-foreground">Upload Updated File / Text Document</h4>
//                   <p className="text-xs text-muted-foreground">
//                     File name is set automatically from the uploaded file. Same file name becomes next version.
//                   </p>
//                 </div>

//                 <div className="grid gap-3 md:grid-cols-2">
//                   <div className="md:col-span-2">
//                     <label className="mb-1 block text-xs font-medium text-muted-foreground">Document Name</label>
//                     {renderAutoNamePreview(uploadDoc)}
//                   </div>

//                   <div>
//                     <label className="mb-1 block text-xs font-medium text-muted-foreground">Category</label>
//                     <select
//                       value={uploadDoc.category}
//                       onChange={(event) => setUploadDoc((prev) => ({ ...prev, category: event.target.value }))}
//                       className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
//                     >
//                       {state.settings.categories.map((category) => (
//                         <option key={category} value={category}>
//                           {category}
//                         </option>
//                       ))}
//                     </select>
//                   </div>

//                   <div>
//                     <label className="mb-1 block text-xs font-medium text-muted-foreground">Workflow Stage</label>
//                     <select
//                       value={uploadDoc.workflowStage || "Workflow Collaboration"}
//                       onChange={(event) => setUploadDoc((prev) => ({ ...prev, workflowStage: event.target.value }))}
//                       className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
//                     >
//                       {workflowUploadStages.map((stage) => (
//                         <option key={stage} value={stage}>
//                           {stage}
//                         </option>
//                       ))}
//                     </select>
//                   </div>

//                   <div className="md:col-span-2">
//                     <label className="mb-1 block text-xs font-medium text-muted-foreground">Upload File</label>
//                     <input
//                       type="file"
//                       onChange={(event) => void handleUploadFileChange(event.target.files?.[0])}
//                       className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1 file:text-xs file:font-medium"
//                     />
//                     {uploadDoc.fileName ? (
//                       <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
//                         <Paperclip className="h-3 w-3" /> {uploadDoc.fileName} · {formatFileSize(uploadDoc.fileSize)}
//                       </p>
//                     ) : null}
//                   </div>

//                   <div className="md:col-span-2">
//                     <label className="mb-1 block text-xs font-medium text-muted-foreground">Text Document</label>
//                     <textarea
//                       value={uploadDoc.textContent || ""}
//                       onChange={(event) => setUploadDoc((prev) => ({ ...prev, textContent: event.target.value }))}
//                       placeholder="Write or paste document text here. Name will be generated automatically if no file is uploaded."
//                       rows={4}
//                       className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
//                     />
//                   </div>

//                   <div className="md:col-span-2">
//                     <label className="mb-1 block text-xs font-medium text-muted-foreground">Note</label>
//                     <input
//                       value={uploadDoc.note || ""}
//                       onChange={(event) => setUploadDoc((prev) => ({ ...prev, note: event.target.value }))}
//                       placeholder="Optional workflow note"
//                       className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
//                     />
//                   </div>
//                 </div>
//               </div>
//             </div>
//           ) : null}

//           <DialogFooter>
//             <Button variant="outline" onClick={() => setUploadRequestId(null)}>
//               Cancel
//             </Button>
//             <Button onClick={() => uploadRequest && uploadUpdatedDocument(uploadRequest)}>
//               <Upload className="h-4 w-4" /> Upload File
//             </Button>
//           </DialogFooter>
//         </DialogContent>
//       </Dialog>

//       <Dialog open={!!historyRequest} onOpenChange={() => setHistoryRequestId(null)}>
//         <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
//           <DialogHeader>
//             <DialogTitle>Revision / Transfer History</DialogTitle>
//           </DialogHeader>

//           {historyRequest ? (
//             <div className="space-y-0 py-2">
//               {[...historyRequest.revisionHistory].reverse().map((entry, index, list) => (
//                 <div key={entry.id} className="relative flex gap-4 pb-6 last:pb-0">
//                   <div className="relative flex w-4 justify-center">
//                     <span className="mt-1 h-2.5 w-2.5 rounded-full bg-primary" />
//                     {index < list.length - 1 ? <span className="absolute left-1/2 top-5 h-[calc(100%-0.5rem)] w-px -translate-x-1/2 bg-border" /> : null}
//                   </div>
//                   <div>
//                     <h4 className="font-semibold text-card-foreground">{entry.action}</h4>
//                     <p className="mt-1 text-sm text-muted-foreground">
//                       {entry.by}
//                       {entry.to ? (
//                         <>
//                           {" "}
//                           <ArrowRight className="mx-1 inline h-3 w-3" /> {entry.to}
//                         </>
//                       ) : null}
//                     </p>
//                     <p className="text-xs text-muted-foreground">{formatDate(entry.at)}</p>
//                     {entry.note ? <p className="mt-2 text-sm text-muted-foreground">“{entry.note}”</p> : null}
//                   </div>
//                 </div>
//               ))}
//             </div>
//           ) : null}
//         </DialogContent>
//       </Dialog>

//       <Dialog open={!!showListDialog} onOpenChange={() => setShowListDialog(null)}>
//         <DialogContent>
//           <DialogHeader>
//             <DialogTitle>Final HML Document Listing</DialogTitle>
//           </DialogHeader>

//           <div className="space-y-4 py-2">
//             <input
//               value={listDocForm.name}
//               onChange={(event) => setListDocForm((prev) => ({ ...prev, name: event.target.value }))}
//               className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
//               placeholder="Final document name"
//             />

//             <select
//               value={listDocForm.category}
//               onChange={(event) => setListDocForm((prev) => ({ ...prev, category: event.target.value }))}
//               className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
//             >
//               {state.settings.categories.map((category) => (
//                 <option key={category} value={category}>
//                   {category}
//                 </option>
//               ))}
//             </select>
//           </div>

//           <DialogFooter>
//             <Button variant="outline" onClick={() => setShowListDialog(null)}>
//               Cancel
//             </Button>
//             <Button
//               onClick={() => {
//                 if (showListDialog && listDocForm.name.trim()) {
//                   listFinalDocument(showListDialog, listDocForm);
//                   toast.success("Final document merged/listed in HML registry");
//                   setShowListDialog(null);
//                 }
//               }}
//             >
//               Merge / List Document
//             </Button>
//           </DialogFooter>
//         </DialogContent>
//       </Dialog>
//     </div>
//   );
// }