import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Download,
  Eye,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderOpen,
  PackageCheck,
  Search,
} from "lucide-react";
import {
  formatDate,
  getProjectLabel,
  type AttachmentRef,
  type ProjectItem,
  type RegistryDocument,
  usePortal,
} from "@/lib/portal-data";

export const Route = createFileRoute("/documents")({
  component: DocumentsPage,
  head: () => ({
    meta: [{ title: "Documents — Project Portal" }],
  }),
});

type FileGroup = "PRIMARY" | "WORKFLOW";

type RegistryRecordWithPackage = RegistryDocument & {
  finalAttachmentId?: string;
  approvedAttachmentId?: string;
  finalPackageAttachmentId?: string;
};

const approvedPackageStagePriority = [
  "HML Registry",
  "CCR Closeout",
  "Division Final Review",
  "TMS Approval - M3",
  "TMS Checking - M2",
  "TMS Drawing - M1",
  "Workflow Collaboration",
];

function safeFileName(name: string) {
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").trim() || "document";
}

function ensureTxtExtension(name: string) {
  return /\.[a-z0-9]+$/i.test(name) ? name : `${name}.txt`;
}

function formatFileSize(size?: number) {
  if (!size) return "Unknown size";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function getAttachmentFileGroup(doc: AttachmentRef): FileGroup {
  const fileGroup = (doc as AttachmentRef & { fileGroup?: FileGroup }).fileGroup;
  return fileGroup || "PRIMARY";
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

function getStageRank(stage?: string) {
  const idx = approvedPackageStagePriority.indexOf(stage || "");
  return idx === -1 ? approvedPackageStagePriority.length : idx;
}

function sortLatestFirst(a: AttachmentRef, b: AttachmentRef) {
  return new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime();
}

function sortByApprovedPriority(a: AttachmentRef, b: AttachmentRef) {
  const stageDiff = getStageRank(a.workflowStage) - getStageRank(b.workflowStage);
  if (stageDiff !== 0) return stageDiff;
  return sortLatestFirst(a, b);
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

function getFileTypeIcon(doc: AttachmentRef) {
  const ext = getFileTypeKey(doc);

  if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext)) return FileImage;
  if (["xls", "xlsx", "csv"].includes(ext)) return FileSpreadsheet;
  if (["zip", "rar", "7z"].includes(ext)) return FileArchive;
  return FileText;
}

function projectRecordLabel(project: ProjectItem) {
  if (project.status === "ARCHIVED") return "Archive";
  return project.type === "BID" ? "Bid" : "Project";
}

function projectRecordClass(project: ProjectItem) {
  if (project.status === "ARCHIVED") return "bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300";
  if (project.type === "BID") return "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300";
  return "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300";
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
        doc.note || "Original binary file is not available for this older/demo document because only metadata was stored.",
      ].join("\n");

  const blob = new Blob([fallbackText], { type: "text/plain;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = objectUrl;
  link.download = ensureTxtExtension(safeFileName(doc.fileName || doc.name || "document"));
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(objectUrl);
}

function downloadRegistryFallback(record: RegistryRecordWithPackage) {
  if (typeof window === "undefined") return;

  const fallbackText = [
    `HML Registry Record`,
    `Document: ${record.name}`,
    `Category: ${record.category}`,
    `Project ID: ${record.projectId}`,
    `Work Request ID: ${record.workRequestId}`,
    `Listed By: ${record.listedBy}`,
    `Listed At: ${formatDate(record.listedAt)}`,
    "",
    "No approved file package is linked to this registry record yet.",
  ].join("\n");

  const blob = new Blob([fallbackText], { type: "text/plain;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = objectUrl;
  link.download = ensureTxtExtension(safeFileName(`${record.name}-registry-record`));
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(objectUrl);
}

function DocumentsPage() {
  const { state } = usePortal();

  const [projectSearch, setProjectSearch] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<AttachmentRef | null>(null);
  const [previewRegistry, setPreviewRegistry] = useState<RegistryRecordWithPackage | null>(null);

  const [fileSearch, setFileSearch] = useState("");
  const [fileType, setFileType] = useState("ALL");
  const [fileDate, setFileDate] = useState("");

  const selectedProject = selectedProjectId ? state.projects.find((project) => project.id === selectedProjectId) : undefined;

  const projectFolders = useMemo(() => {
    const q = projectSearch.trim().toLowerCase();

    return state.projects
      .filter((project) => {
        const text = `${project.code} ${project.name} ${project.type} ${project.status}`.toLowerCase();
        return !q || text.includes(q);
      })
      .map((project) => {
        const files = project.initialDocuments || [];
        const registryRecords = state.documents.filter((doc) => doc.projectId === project.id);
        const latestFile = [...files].sort(sortLatestFirst)[0];

        return {
          project,
          files,
          registryRecords,
          latestFile,
          primaryCount: files.filter((doc) => getAttachmentFileGroup(doc) === "PRIMARY").length,
          workflowCount: files.filter((doc) => getAttachmentFileGroup(doc) === "WORKFLOW").length,
        };
      })
      .sort((a, b) => {
        const aTime = a.latestFile?.uploadedAt || a.project.createdAt;
        const bTime = b.latestFile?.uploadedAt || b.project.createdAt;
        return bTime.localeCompare(aTime);
      });
  }, [projectSearch, state.documents, state.projects]);

  const selectedProjectFiles = selectedProject?.initialDocuments || [];
  const selectedRegistryRecords = selectedProject
    ? (state.documents.filter((doc) => doc.projectId === selectedProject.id) as RegistryRecordWithPackage[])
    : [];

  const fileTypeOptions = useMemo(() => {
    return Array.from(new Set(selectedProjectFiles.map((doc) => getFileTypeKey(doc)))).sort((a, b) => a.localeCompare(b));
  }, [selectedProjectFiles]);

  const filteredFiles = useMemo(() => {
    return filterAttachmentFiles(selectedProjectFiles, fileSearch, fileType, fileDate).sort(sortLatestFirst);
  }, [fileDate, fileSearch, fileType, selectedProjectFiles]);

  const filteredPrimaryFiles = filteredFiles.filter((doc) => getAttachmentFileGroup(doc) === "PRIMARY");
  const filteredWorkflowFiles = filteredFiles.filter((doc) => getAttachmentFileGroup(doc) === "WORKFLOW");
  const hasActiveFileFilter = Boolean(fileSearch.trim() || fileType !== "ALL" || fileDate);

  const openProjectFolder = (projectId: string) => {
    setSelectedProjectId(projectId);
    setFileSearch("");
    setFileType("ALL");
    setFileDate("");
  };

  const closeProjectFolder = () => {
    setSelectedProjectId(null);
    setFileSearch("");
    setFileType("ALL");
    setFileDate("");
  };

  const findApprovedPackage = (record: RegistryRecordWithPackage) => {
    const project = state.projects.find((item) => item.id === record.projectId);
    if (!project) return undefined;

    const directAttachmentId = record.finalPackageAttachmentId || record.approvedAttachmentId || record.finalAttachmentId;

    if (directAttachmentId) {
      const direct = project.initialDocuments.find((doc) => doc.id === directAttachmentId);
      if (direct) return direct;
    }

    const workflowFiles = project.initialDocuments
      .filter((doc) => getAttachmentFileGroup(doc) === "WORKFLOW")
      .filter((doc) => doc.fileDataUrl || doc.fileName || doc.textContent)
      .sort(sortByApprovedPriority);

    const exactNameMatch = workflowFiles.find((doc) => {
      const registryName = record.name.toLowerCase().trim();
      const docName = doc.name.toLowerCase().trim();
      const fileName = doc.fileName?.toLowerCase().trim();

      return docName === registryName || fileName === registryName;
    });

    if (exactNameMatch) return exactNameMatch;

    const closeoutPackage = workflowFiles.find((doc) =>
      ["HML Registry", "CCR Closeout", "Division Final Review", "TMS Approval - M3"].includes(doc.workflowStage || "")
    );

    if (closeoutPackage) return closeoutPackage;
    if (workflowFiles.length) return workflowFiles[0];

    return project.initialDocuments
      .filter((doc) => doc.fileDataUrl || doc.fileName || doc.textContent)
      .sort(sortLatestFirst)[0];
  };

  const handleDownloadApprovedPackage = (record: RegistryRecordWithPackage) => {
    const approvedPackage = findApprovedPackage(record);

    if (approvedPackage) {
      void downloadAttachment(approvedPackage);
      return;
    }

    downloadRegistryFallback(record);
  };

  const renderFileCard = (doc: AttachmentRef) => {
    const FileIcon = getFileTypeIcon(doc);

    return (
      <div key={doc.id} className="rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted/20">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <FileIcon className="h-5 w-5" />
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate font-semibold text-card-foreground">{doc.name}</p>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">v{doc.version || 1}</span>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  {getFileTypeLabel(getFileTypeKey(doc))}
                </span>
                <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                  {getAttachmentFileGroup(doc) === "PRIMARY" ? "Primary" : "Workflow"}
                </span>
              </div>

              <p className="mt-1 text-xs text-muted-foreground">
                {doc.category} · {doc.workflowStage || "Workflow Collaboration"}
              </p>

              <p className="mt-1 text-xs text-muted-foreground">
                Uploaded by {doc.uploadedBy} · {formatDate(doc.uploadedAt)}
                {doc.fileName ? ` · ${doc.fileName}` : ""}
                {doc.fileSize ? ` · ${formatFileSize(doc.fileSize)}` : ""}
              </p>

              {doc.textContent ? <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{doc.textContent}</p> : null}
              {doc.note ? <p className="mt-2 text-xs text-muted-foreground">Note: {doc.note}</p> : null}
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setPreviewFile(doc)}>
              <Eye className="h-4 w-4" />
              View
            </Button>

            <Button variant="outline" size="sm" onClick={() => void downloadAttachment(doc)}>
              <Download className="h-4 w-4" />
              Download
            </Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div>
      <PageHeader
        title="Documents"
        description="Project-wise document folders with uploaded file versions, preview, download, and filters."
      />

      <div className="mb-5 flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search project folders..."
            value={projectSearch}
            onChange={(event) => setProjectSearch(event.target.value)}
            className="w-full rounded-lg border border-input bg-background py-2 pl-9 pr-4 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {projectFolders.map(({ project, files, registryRecords, latestFile, primaryCount, workflowCount }) => (
          <div key={project.id} className="group rounded-2xl border border-border bg-card p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 text-primary">
                <Folder className="h-7 w-7" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-base font-semibold text-card-foreground">{project.name}</p>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${projectRecordClass(project)}`}>
                    {projectRecordLabel(project)}
                  </span>
                </div>

                <p className="mt-1 font-mono text-xs text-muted-foreground">{project.code}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Folder contains all uploaded project/bid files, including versions and final listed packages.
                </p>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-border bg-muted/30 px-3 py-3 text-center">
                <p className="text-lg font-semibold text-card-foreground">{files.length}</p>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Total Files</p>
              </div>

              <div className="rounded-xl border border-border bg-muted/30 px-3 py-3 text-center">
                <p className="text-lg font-semibold text-card-foreground">{primaryCount}</p>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Primary</p>
              </div>

              <div className="rounded-xl border border-border bg-muted/30 px-3 py-3 text-center">
                <p className="text-lg font-semibold text-card-foreground">{workflowCount}</p>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Workflow</p>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-dashed border-border bg-muted/20 px-3 py-3">
              <p className="text-xs font-medium text-card-foreground">Latest Activity</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {latestFile ? `${latestFile.name} · ${formatDate(latestFile.uploadedAt)}` : "No file uploaded yet"}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {registryRecords.length > 0 ? `Final HML Records: ${registryRecords.length}` : "No final HML record yet"}
              </p>
            </div>

            <Button className="mt-5 w-full" onClick={() => openProjectFolder(project.id)}>
              <FolderOpen className="h-4 w-4" />
              Open Folder
            </Button>
          </div>
        ))}

        {!projectFolders.length ? (
          <div className="col-span-full rounded-xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
            No project folders found.
          </div>
        ) : null}
      </div>

      <Dialog open={!!selectedProject} onOpenChange={(open) => !open && closeProjectFolder()}>
        <DialogContent className="max-h-[90vh] max-w-6xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedProject ? `${selectedProject.name} — Document Folder` : "Project Documents"}</DialogTitle>
          </DialogHeader>

          {selectedProject ? (
            <div className="space-y-5 py-2">
              <div className="grid gap-3 rounded-xl border border-border bg-muted/20 p-4 text-sm md:grid-cols-4">
                <div>
                  <p className="text-xs text-muted-foreground">Project / Bid</p>
                  <p className="font-medium text-foreground">{getProjectLabel(selectedProject)}</p>
                </div>

                <div>
                  <p className="text-xs text-muted-foreground">Record Status</p>
                  <p className="font-medium text-foreground">{projectRecordLabel(selectedProject)}</p>
                </div>

                <div>
                  <p className="text-xs text-muted-foreground">Workflow Status</p>
                  <p className="font-medium text-foreground">{selectedProject.status}</p>
                </div>

                <div>
                  <p className="text-xs text-muted-foreground">Total Files</p>
                  <p className="font-medium text-foreground">{selectedProjectFiles.length}</p>
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
                        value={fileSearch}
                        onChange={(event) => setFileSearch(event.target.value)}
                        placeholder="Search by file name..."
                        className="w-full rounded-lg border border-input bg-background py-2 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">File Type</label>
                    <select
                      value={fileType}
                      onChange={(event) => setFileType(event.target.value)}
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
                      value={fileDate}
                      onChange={(event) => setFileDate(event.target.value)}
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>

                  <Button
                    variant="outline"
                    disabled={!hasActiveFileFilter}
                    onClick={() => {
                      setFileSearch("");
                      setFileType("ALL");
                      setFileDate("");
                    }}
                  >
                    Clear
                  </Button>
                </div>

                <p className="mt-3 text-xs text-muted-foreground">
                  Showing {filteredFiles.length} of {selectedProjectFiles.length} file(s)
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
                      {hasActiveFileFilter ? "No primary file matches this filter." : "No primary file uploaded yet."}
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
                      {hasActiveFileFilter ? "No workflow file matches this filter." : "No workflow file uploaded yet."}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-card-foreground">HML Registry Records</h4>
                <p className="mt-1 text-xs text-muted-foreground">Final listed registry records linked with this project.</p>

                <div className="mt-3 space-y-3">
                  {selectedRegistryRecords.length ? (
                    selectedRegistryRecords.map((record) => {
                      const approvedPackage = findApprovedPackage(record);

                      return (
                        <div key={record.id} className="rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted/20">
                          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                            <div className="flex min-w-0 gap-3">
                              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                <PackageCheck className="h-5 w-5" />
                              </div>

                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="font-semibold text-card-foreground">{record.name}</p>
                                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Final Listed</span>
                                </div>

                                <p className="mt-1 text-xs text-muted-foreground">
                                  {record.category} · Listed by {record.listedBy} · {formatDate(record.listedAt)}
                                </p>

                                {approvedPackage ? (
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    Approved package: {approvedPackage.fileName || approvedPackage.name} · v{approvedPackage.version || 1}
                                  </p>
                                ) : (
                                  <p className="mt-1 text-xs text-muted-foreground">No approved package linked.</p>
                                )}
                              </div>
                            </div>

                            <div className="flex shrink-0 flex-wrap gap-2">
                              <Button variant="outline" size="sm" onClick={() => setPreviewRegistry(record)}>
                                <Eye className="h-4 w-4" />
                                View
                              </Button>

                              <Button variant="outline" size="sm" onClick={() => handleDownloadApprovedPackage(record)}>
                                <Download className="h-4 w-4" />
                                Download Package
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
                      No HML registry record listed for this project yet.
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : null}
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

      <Dialog open={!!previewRegistry} onOpenChange={() => setPreviewRegistry(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>HML Registry Entry</DialogTitle>
          </DialogHeader>

          {previewRegistry ? (
            <div className="space-y-5 py-2">
              <div className="rounded-xl border border-border bg-muted/20 p-6 text-center">
                <PackageCheck className="mx-auto h-12 w-12 text-primary" />
                <p className="mt-3 font-semibold text-card-foreground">{previewRegistry.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">Official HML final document registry record</p>
              </div>

              <div className="grid gap-3 text-sm md:grid-cols-2">
                <p>
                  <span className="text-muted-foreground">Category:</span> {previewRegistry.category}
                </p>
                <p>
                  <span className="text-muted-foreground">Listed By:</span> {previewRegistry.listedBy}
                </p>
                <p>
                  <span className="text-muted-foreground">Listed At:</span> {formatDate(previewRegistry.listedAt)}
                </p>
                <p>
                  <span className="text-muted-foreground">Status:</span> Final Listed
                </p>
              </div>

              <div className="flex justify-end">
                <Button onClick={() => handleDownloadApprovedPackage(previewRegistry)}>
                  <Download className="h-4 w-4" />
                  Download Approved Package
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// import { createFileRoute } from "@tanstack/react-router";
// import { useMemo, useState } from "react";
// import { PageHeader } from "@/components/PageHeader";
// import { Button } from "@/components/ui/button";
// import { Search, Download, Eye, FileText } from "lucide-react";
// import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
// import { formatDate, getProjectLabel, usePortal } from "@/lib/portal-data";

// export const Route = createFileRoute("/documents")({
//   component: DocumentsPage,
//   head: () => ({
//     meta: [{ title: "Documents — Project Portal" }],
//   }),
// });

// function DocumentsPage() {
//   const { state } = usePortal();
//   const [search, setSearch] = useState("");
//   const [previewId, setPreviewId] = useState<string | null>(null);

//   const documents = useMemo(() => {
//     const q = search.toLowerCase();
//     return state.documents.filter((doc) => !q || doc.name.toLowerCase().includes(q) || doc.category.toLowerCase().includes(q));
//   }, [search, state.documents]);

//   const preview = state.documents.find((doc) => doc.id === previewId);
//   const previewProject = preview ? state.projects.find((project) => project.id === preview.projectId) : undefined;
//   const previewRequest = preview ? state.workRequests.find((request) => request.id === preview.workRequestId) : undefined;

//   return (
//     <div>
//       <PageHeader title="Documents" description="Final HML document registry after CCR closeout." />

//       <div className="mb-4 flex items-center gap-3">
//         <div className="relative flex-1 max-w-sm">
//           <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
//           <input
//             type="text"
//             placeholder="Search listed documents..."
//             value={search}
//             onChange={(e) => setSearch(e.target.value)}
//             className="w-full rounded-lg border border-input bg-background pl-9 pr-4 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
//           />
//         </div>
//       </div>

//       <div className="rounded-xl border border-border bg-card overflow-hidden">
//         <table className="w-full text-sm">
//           <thead>
//             <tr className="border-b border-border bg-muted/50">
//               <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Document</th>
//               <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Project</th>
//               <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Work Request</th>
//               <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Category</th>
//               <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Listed By</th>
//               <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Listed At</th>
//               <th className="px-5 py-3" />
//             </tr>
//           </thead>
//           <tbody className="divide-y divide-border">
//             {documents.map((doc) => {
//               const project = state.projects.find((item) => item.id === doc.projectId);
//               const workRequest = state.workRequests.find((item) => item.id === doc.workRequestId);
//               return (
//                 <tr key={doc.id} className="hover:bg-muted/30 transition-colors">
//                   <td className="px-5 py-3.5">
//                     <div className="flex items-center gap-3">
//                       <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
//                         <FileText className="h-4 w-4 text-primary" />
//                       </div>
//                       <div>
//                         <p className="font-medium text-card-foreground">{doc.name}</p>
//                         <p className="text-xs text-muted-foreground">Final listed document</p>
//                       </div>
//                     </div>
//                   </td>
//                   <td className="px-5 py-3.5 text-muted-foreground">{project ? getProjectLabel(project) : "Unknown"}</td>
//                   <td className="px-5 py-3.5 text-muted-foreground">{workRequest?.code || "Unknown"}</td>
//                   <td className="px-5 py-3.5 text-muted-foreground">{doc.category}</td>
//                   <td className="px-5 py-3.5 text-muted-foreground">{doc.listedBy}</td>
//                   <td className="px-5 py-3.5 text-muted-foreground">{formatDate(doc.listedAt)}</td>
//                   <td className="px-5 py-3.5">
//                     <div className="flex gap-2 justify-end">
//                       <Button variant="outline" size="sm" onClick={() => setPreviewId(doc.id)}><Eye className="h-3.5 w-3.5" />View</Button>
//                       <Button variant="outline" size="sm"><Download className="h-3.5 w-3.5" />Download</Button>
//                     </div>
//                   </td>
//                 </tr>
//               );
//             })}
//             {!documents.length && (
//               <tr>
//                 <td colSpan={7} className="px-5 py-12 text-center text-muted-foreground">No documents have been listed in the HML registry yet.</td>
//               </tr>
//             )}
//           </tbody>
//         </table>
//       </div>

//       <Dialog open={!!preview} onOpenChange={() => setPreviewId(null)}>
//         <DialogContent className="max-w-xl">
//           <DialogHeader>
//             <DialogTitle>Document Registry Entry</DialogTitle>
//           </DialogHeader>
//           {preview && (
//             <div className="space-y-4 py-2">
//               <div className="rounded-lg border border-border bg-muted/20 p-6 text-center">
//                 <FileText className="mx-auto h-12 w-12 text-primary" />
//                 <p className="mt-3 font-medium text-card-foreground">{preview.name}</p>
//               </div>
//               <div className="grid gap-3 text-sm md:grid-cols-2">
//                 <p><span className="text-muted-foreground">Project:</span> {previewProject ? getProjectLabel(previewProject) : "Unknown"}</p>
//                 <p><span className="text-muted-foreground">Work Request:</span> {previewRequest?.code || "Unknown"}</p>
//                 <p><span className="text-muted-foreground">Category:</span> {preview.category}</p>
//                 <p><span className="text-muted-foreground">Listed By:</span> {preview.listedBy}</p>
//                 <p><span className="text-muted-foreground">Listed At:</span> {formatDate(preview.listedAt)}</p>
//               </div>
//             </div>
//           )}
//         </DialogContent>
//       </Dialog>
//     </div>
//   );
// }
