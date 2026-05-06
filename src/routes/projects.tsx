import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import { Download, Edit, Eye, FileText, Filter, Mail, MoreHorizontal, Paperclip, Plus, Search, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { actorCanManageProjects, formatDate, type AttachmentInput, type AttachmentRef, type ProjectItem, usePortal } from "@/lib/portal-data";

export const Route = createFileRoute("/projects")({
  component: ProjectsPage,
  head: () => ({
    meta: [{ title: "Projects & Bids — Project Portal" }],
  }),
});

type TypeFilter = "ALL" | "BID" | "PROJECT";
type StatusFilter = "ALL" | ProjectItem["status"];
type DocumentFormRow = AttachmentInput;

const workflowStages = [
  "Project / Bid Intake",
  "Client Upload",
  "Work Request Creation",
  "ECM / PMO Review",
  "TMS Drawing",
  "TMS Checking",
  "TMS Approval",
  "CCR Closeout",
  "HML Registry",
  "Workflow Collaboration",
];

function createEmptyDocumentRow(category = "General", workflowStage = "Project / Bid Intake"): DocumentFormRow {
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

function formatShortDate(value: string) {
  return new Date(value).toISOString().slice(0, 10);
}

function formatFileSize(size?: number) {
  if (!size) return "Unknown size";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function projectProgress(project: ProjectItem, workRequestCount: number) {
  if (project.status === "COMPLETED") return 100;
  if (project.status === "ACTIVE") return Math.min(90, 60 + workRequestCount * 5);
  if (project.status === "BIDDING") return Math.min(70, 45 + workRequestCount * 3);
  return 10;
}

function projectStatusLabel(status: ProjectItem["status"]) {
  if (status === "DRAFT") return "Pending";
  if (status === "BIDDING") return "Active";
  if (status === "ACTIVE") return "In Progress";
  return "Completed";
}

function projectStatusClass(status: ProjectItem["status"]) {
  if (status === "DRAFT") return "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300";
  if (status === "BIDDING") return "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300";
  if (status === "ACTIVE") return "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300";
  return "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300";
}

function normalizeDocuments(docs: DocumentFormRow[]) {
  return docs
    .map((doc) => ({
      ...doc,
      name: doc.name.trim() || doc.fileName || "Untitled document",
      textContent: doc.textContent?.trim() || undefined,
      note: doc.note?.trim() || undefined,
    }))
    .filter((doc) => Boolean(doc.textContent || doc.fileDataUrl || doc.fileName));
}

function safeFileName(name: string) {
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").trim() || "document";
}

function ensureTxtExtension(name: string) {
  return /\.[a-z0-9]+$/i.test(name) ? name : `${name}.txt`;
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
        `Workflow Stage: ${doc.workflowStage || "Project / Bid Intake"}`,
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

function ProjectsPage() {
  const { state, currentActor, addProject, addClientDocument } = usePortal();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [showCreate, setShowCreate] = useState(false);
  const [showUpload, setShowUpload] = useState<string | null>(null);
  const [viewProjectId, setViewProjectId] = useState<string | null>(null);
  const [projectForm, setProjectForm] = useState({
    name: "",
    type: "BID" as ProjectItem["type"],
    clientId: state.clients[0]?.id || "",
    sourceChannel: "Email Intake",
    docs: [createEmptyDocumentRow(state.settings.categories[0] || "General")],
  });
  const [clientDoc, setClientDoc] = useState<DocumentFormRow>(
    createEmptyDocumentRow(state.settings.categories[0] || "General", "Workflow Collaboration")
  );

  const selectedClient = state.clients.find((client) => client.id === projectForm.clientId);
  const canManage = actorCanManageProjects(currentActor.role);
  const viewProject = state.projects.find((project) => project.id === viewProjectId);
  const uploadProject = state.projects.find((project) => project.id === showUpload);

  const canUploadDocuments = (project: ProjectItem) => currentActor.role !== "client_owner" || currentActor.clientId === project.clientId;

  const visibleProjects = useMemo(() => {
    let list = state.projects;

    if (currentActor.role === "client_owner" && currentActor.clientId) {
      list = list.filter((project) => project.clientId === currentActor.clientId);
    }

    if (typeFilter !== "ALL") {
      list = list.filter((project) => project.type === typeFilter);
    }

    if (statusFilter !== "ALL") {
      list = list.filter((project) => project.status === statusFilter);
    }

    const q = search.trim().toLowerCase();
    if (!q) return list;

    return list.filter((project) => {
      const client = state.clients.find((item) => item.id === project.clientId);
      return (
        project.name.toLowerCase().includes(q) ||
        project.code.toLowerCase().includes(q) ||
        project.type.toLowerCase().includes(q) ||
        projectStatusLabel(project.status).toLowerCase().includes(q) ||
        (client?.name.toLowerCase().includes(q) ?? false)
      );
    });
  }, [currentActor.clientId, currentActor.role, search, state.clients, state.projects, statusFilter, typeFilter]);

  const updateProjectDoc = (idx: number, patch: Partial<DocumentFormRow>) => {
    setProjectForm((prev) => ({
      ...prev,
      docs: prev.docs.map((doc, docIdx) => (docIdx === idx ? { ...doc, ...patch } : doc)),
    }));
  };

  const handleProjectFileChange = async (idx: number, file?: File) => {
    if (!file) return;

    try {
      const fileDataUrl = await readFileAsDataUrl(file);
      updateProjectDoc(idx, {
        name: projectForm.docs[idx]?.name || file.name,
        fileName: file.name,
        fileType: file.type || "application/octet-stream",
        fileSize: file.size,
        fileDataUrl,
      });
    } catch {
      toast.error("Could not read selected file");
    }
  };

  const handleClientFileChange = async (file?: File) => {
    if (!file) return;

    try {
      const fileDataUrl = await readFileAsDataUrl(file);
      setClientDoc((prev) => ({
        ...prev,
        name: prev.name || file.name,
        fileName: file.name,
        fileType: file.type || "application/octet-stream",
        fileSize: file.size,
        fileDataUrl,
      }));
    } catch {
      toast.error("Could not read selected file");
    }
  };

  const addDocRow = () => {
    setProjectForm((prev) => ({ ...prev, docs: [...prev.docs, createEmptyDocumentRow(state.settings.categories[0] || "General")] }));
  };

  const removeDocRow = (idx: number) => {
    setProjectForm((prev) => ({
      ...prev,
      docs: prev.docs.length === 1 ? prev.docs : prev.docs.filter((_, docIdx) => docIdx !== idx),
    }));
  };

  const createProject = () => {
    if (!projectForm.name.trim()) return toast.error("Bid / Project name is required");
    if (!projectForm.clientId) return toast.error("Client is required");

    const initialDocuments = normalizeDocuments(projectForm.docs);
    if (!initialDocuments.length) {
      return toast.error("Add at least one initial text document or uploaded file");
    }

    const created = addProject({
      name: projectForm.name.trim(),
      type: projectForm.type,
      clientId: projectForm.clientId,
      sourceChannel: projectForm.sourceChannel.trim() || "Email Intake",
      initialDocuments,
    });

    toast.success("Project/Bid created", {
      description: `${created.code} created. Client credentials were prepared for ${selectedClient?.email || created.clientEmail}.`,
    });

    setProjectForm({
      name: "",
      type: "BID",
      clientId: state.clients[0]?.id || "",
      sourceChannel: "Email Intake",
      docs: [createEmptyDocumentRow(state.settings.categories[0] || "General")],
    });
    setShowCreate(false);
  };

  const uploadClientDoc = () => {
    if (!showUpload) return;

    const documents = normalizeDocuments([clientDoc]);
    if (!documents.length) {
      return toast.error("Add text content or upload a file before attaching");
    }

    addClientDocument(showUpload, documents[0]);
    toast.success("Document uploaded", {
      description: "The original file is stored and available for authorized workflow users to download.",
    });
    setClientDoc(createEmptyDocumentRow(state.settings.categories[0] || "General", "Workflow Collaboration"));
    setShowUpload(null);
  };

  return (
    <div>
      <PageHeader
        title="Projects / Bids"
        description="Manage project and bid intake"
        actions={
          canManage ? (
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" /> New Bid / Project
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-4 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="justify-start gap-2">
              <Filter className="h-4 w-4" /> Status
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
            <DropdownMenuItem onSelect={() => setStatusFilter("ALL")}>All Statuses</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setStatusFilter("BIDDING")}>Active</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setStatusFilter("ACTIVE")}>In Progress</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setStatusFilter("DRAFT")}>Pending</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setStatusFilter("COMPLETED")}>Completed</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="inline-flex w-full rounded-lg border border-input bg-background p-1 lg:w-auto">
          {[
            { label: "All", value: "ALL" as const },
            { label: "Bids", value: "BID" as const },
            { label: "Projects", value: "PROJECT" as const },
          ].map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setTypeFilter(item.value)}
              className={`h-8 flex-1 rounded-md px-4 text-sm transition-colors lg:flex-none ${
                typeFilter === item.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="border-b border-border bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-4 font-semibold">Project / Bid</th>
                <th className="px-5 py-4 font-semibold">Client</th>
                <th className="px-5 py-4 font-semibold">Type</th>
                <th className="px-5 py-4 font-semibold">Status</th>
                <th className="px-5 py-4 font-semibold">WRs</th>
                <th className="px-5 py-4 font-semibold">Progress</th>
                <th className="px-5 py-4 font-semibold">Date</th>
                <th className="px-5 py-4 text-right font-semibold">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-border">
              {visibleProjects.map((project) => {
                const client = state.clients.find((item) => item.id === project.clientId);
                const workRequestCount = state.workRequests.filter((request) => request.parentId === project.id).length;
                const progress = projectProgress(project, workRequestCount);

                return (
                  <tr key={project.id} className="bg-card transition-colors hover:bg-muted/30">
                    <td className="px-5 py-4 align-top">
                      <p className="font-semibold text-card-foreground">{project.name}</p>
                      <p className="mt-1 font-mono text-xs text-muted-foreground">{project.code}</p>
                    </td>

                    <td className="px-5 py-4 align-top">
                      <p className="text-sm text-card-foreground">{client?.name || "Unknown"}</p>
                      {project.credentialsSent ? (
                        <p className="mt-1 text-xs text-emerald-600">✓ Credentials sent</p>
                      ) : (
                        <p className="mt-1 text-xs text-amber-600">Credentials pending</p>
                      )}
                    </td>

                    <td className="px-5 py-4 align-top">
                      <span className="inline-flex rounded-md bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
                        {project.type === "BID" ? "Bid" : "Project"}
                      </span>
                    </td>

                    <td className="px-5 py-4 align-top">
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${projectStatusClass(project.status)}`}>
                        {projectStatusLabel(project.status)}
                      </span>
                    </td>

                    <td className="px-5 py-4 align-top text-card-foreground">{workRequestCount}</td>

                    <td className="px-5 py-4 align-top">
                      <div className="flex min-w-[140px] items-center gap-2">
                        <Progress value={progress} className="h-1.5 flex-1 bg-muted" />
                        <span className="w-9 text-xs text-muted-foreground">{progress}%</span>
                      </div>
                    </td>

                    <td className="px-5 py-4 align-top text-muted-foreground">{formatShortDate(project.createdAt)}</td>

                    <td className="px-5 py-4 align-top text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>

                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem onSelect={() => setViewProjectId(project.id)}>
                            <Eye className="h-4 w-4" /> View
                          </DropdownMenuItem>

                          <DropdownMenuItem onSelect={() => setShowUpload(project.id)} disabled={!canUploadDocuments(project)}>
                            <Upload className="h-4 w-4" /> Upload File
                          </DropdownMenuItem>

                          <DropdownMenuItem onSelect={() => toast.info("Edit can be connected to backend update API later.")}>
                            <Edit className="h-4 w-4" /> Edit
                          </DropdownMenuItem>

                          <DropdownMenuSeparator />

                          <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => toast.info("Delete is not enabled here to avoid orphan work requests.")}>
                            <Trash2 className="h-4 w-4" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!visibleProjects.length && <div className="p-10 text-center text-sm text-muted-foreground">No bids/projects found.</div>}
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Bid / Project</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-2 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Bid / Project Name</label>
              <input
                type="text"
                value={projectForm.name}
                onChange={(event) => setProjectForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="e.g. DEME Offshore Wind Farm Transport"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Type</label>
              <select
                value={projectForm.type}
                onChange={(event) => setProjectForm((prev) => ({ ...prev, type: event.target.value as ProjectItem["type"] }))}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="BID">Bid</option>
                <option value="PROJECT">Project</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Client</label>
              <select
                value={projectForm.clientId}
                onChange={(event) => setProjectForm((prev) => ({ ...prev, clientId: event.target.value }))}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {state.clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Client Email</label>
              <div className="flex items-center gap-2 rounded-lg border border-input bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                <Mail className="h-4 w-4" />
                {selectedClient?.email || "No email"}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Credentials are prepared after creation so the client can upload more documents during collaboration.
              </p>
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium text-foreground">Source Channel</label>
              <input
                type="text"
                value={projectForm.sourceChannel}
                onChange={(event) => setProjectForm((prev) => ({ ...prev, sourceChannel: event.target.value }))}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="md:col-span-2 rounded-xl border border-border p-4">
              <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-card-foreground">Primary File List</h4>
                  <p className="text-xs text-muted-foreground">
                   CCR / Marketing uploads original client documents here. These files become the primary file list for this Bid / Project.
                  </p>
                </div>

                <Button variant="outline" size="sm" onClick={addDocRow}>
                  <Plus className="h-4 w-4" /> Add Document
                </Button>
              </div>

              <div className="space-y-4">
                {projectForm.docs.map((doc, idx) => (
                  <div key={idx} className="rounded-xl border border-border bg-muted/20 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-sm font-semibold text-foreground">Document #{idx + 1}</p>
                      <Button variant="ghost" size="sm" onClick={() => removeDocRow(idx)} disabled={projectForm.docs.length === 1}>
                        Remove
                      </Button>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-muted-foreground">Document Title</label>
                        <input
                          type="text"
                          value={doc.name}
                          onChange={(event) => updateProjectDoc(idx, { name: event.target.value })}
                          placeholder="Document title or file name"
                          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-medium text-muted-foreground">Category</label>
                        <select
                          value={doc.category}
                          onChange={(event) => updateProjectDoc(idx, { category: event.target.value })}
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
                          value={doc.workflowStage || "Project / Bid Intake"}
                          onChange={(event) => updateProjectDoc(idx, { workflowStage: event.target.value })}
                          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        >
                          {workflowStages.map((stage) => (
                            <option key={stage} value={stage}>
                              {stage}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-medium text-muted-foreground">Upload File</label>
                        <input
                          type="file"
                          onChange={(event) => void handleProjectFileChange(idx, event.target.files?.[0])}
                          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1 file:text-xs file:font-medium"
                        />
                        {doc.fileName ? (
                          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                            <Paperclip className="h-3 w-3" /> {doc.fileName} · {formatFileSize(doc.fileSize)}
                          </p>
                        ) : null}
                      </div>

                      <div className="md:col-span-2">
                        <label className="mb-1 block text-xs font-medium text-muted-foreground">Text Document</label>
                        <textarea
                          value={doc.textContent || ""}
                          onChange={(event) => updateProjectDoc(idx, { textContent: event.target.value })}
                          placeholder="Write or paste document text here. This will be stored as a downloadable text document."
                          rows={4}
                          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className="mb-1 block text-xs font-medium text-muted-foreground">Note</label>
                        <input
                          type="text"
                          value={doc.note || ""}
                          onChange={(event) => updateProjectDoc(idx, { note: event.target.value })}
                          placeholder="Optional note for this document"
                          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button onClick={createProject}>Create and Send Credentials</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!showUpload} onOpenChange={() => setShowUpload(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Upload Workflow Document</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
              Attach a new text document or upload any file type for <span className="font-medium text-foreground">{uploadProject?.code}</span>. Authorized users can download it from this project/bid record.
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Document Title</label>
                <input
                  type="text"
                  value={clientDoc.name}
                  onChange={(event) => setClientDoc((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="Document title or file name"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Category</label>
                <select
                  value={clientDoc.category}
                  onChange={(event) => setClientDoc((prev) => ({ ...prev, category: event.target.value }))}
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
                  value={clientDoc.workflowStage || "Workflow Collaboration"}
                  onChange={(event) => setClientDoc((prev) => ({ ...prev, workflowStage: event.target.value }))}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {workflowStages.map((stage) => (
                    <option key={stage} value={stage}>
                      {stage}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Upload File</label>
                <input
                  type="file"
                  onChange={(event) => void handleClientFileChange(event.target.files?.[0])}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1 file:text-xs file:font-medium"
                />
                {clientDoc.fileName ? (
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <Paperclip className="h-3 w-3" /> {clientDoc.fileName} · {formatFileSize(clientDoc.fileSize)}
                  </p>
                ) : null}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Text Document</label>
              <textarea
                value={clientDoc.textContent || ""}
                onChange={(event) => setClientDoc((prev) => ({ ...prev, textContent: event.target.value }))}
                placeholder="Write or paste document text here."
                rows={5}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Note</label>
              <input
                type="text"
                value={clientDoc.note || ""}
                onChange={(event) => setClientDoc((prev) => ({ ...prev, note: event.target.value }))}
                placeholder="Optional collaboration note"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUpload(null)}>
              Cancel
            </Button>
            <Button onClick={uploadClientDoc}>Upload Document</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewProject} onOpenChange={() => setViewProjectId(null)}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{viewProject?.name}</DialogTitle>
          </DialogHeader>

          {viewProject ? (
            <div className="space-y-5 py-2">
              <div className="grid gap-3 rounded-xl border border-border bg-muted/20 p-4 text-sm md:grid-cols-3">
                <div>
                  <p className="text-xs text-muted-foreground">Code</p>
                  <p className="font-medium text-foreground">{viewProject.code}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Type</p>
                  <p className="font-medium text-foreground">{viewProject.type === "BID" ? "Bid" : "Project"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <p className="font-medium text-foreground">{projectStatusLabel(viewProject.status)}</p>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-card-foreground">Documents & Files</h4>
                  <p className="text-xs text-muted-foreground">Download existing documents or upload a new collaboration file at any workflow stage.</p>
                </div>

                {canUploadDocuments(viewProject) ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowUpload(viewProject.id);
                      setViewProjectId(null);
                    }}
                  >
                    <Upload className="h-4 w-4" /> Upload New File
                  </Button>
                ) : null}
              </div>

              <div className="space-y-3">
                {viewProject.initialDocuments.map((doc) => (
                  <div key={doc.id} className="rounded-xl border border-border bg-card p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <p className="font-medium text-card-foreground">{doc.name}</p>
                          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">v{doc.version || 1}</span>
                        </div>

                        <p className="mt-1 text-xs text-muted-foreground">
                          {doc.category} · {doc.workflowStage || "Project / Bid Intake"} · Uploaded by {doc.uploadedBy} · {formatDate(doc.uploadedAt)}
                        </p>

                        {doc.fileName ? <p className="mt-1 text-xs text-muted-foreground">File: {doc.fileName} · {formatFileSize(doc.fileSize)}</p> : null}
                        {doc.textContent ? <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{doc.textContent}</p> : null}
                        {doc.note ? <p className="mt-2 text-xs text-muted-foreground">Note: {doc.note}</p> : null}
                      </div>

                      <Button variant="outline" size="sm" onClick={() => void downloadAttachment(doc)}>
                        <Download className="h-4 w-4" /> Download
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}