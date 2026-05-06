import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Download, Eye, FileText, PackageCheck, Search } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDate, getProjectLabel, type AttachmentRef, usePortal } from "@/lib/portal-data";

export const Route = createFileRoute("/documents")({
  component: DocumentsPage,
  head: () => ({
    meta: [{ title: "HML Registry — Project Portal" }],
  }),
});

type FileGroup = "PRIMARY" | "WORKFLOW";

type RegistryRecordWithPackage = {
  id: string;
  projectId: string;
  workRequestId: string;
  name: string;
  category: string;
  divisionId: string;
  listedAt: string;
  listedBy: string;
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

async function downloadAttachment(doc: AttachmentRef) {
  if (typeof window === "undefined") return;

  if (doc.fileDataUrl) {
    try {
      const response = await fetch(doc.fileDataUrl);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = objectUrl;
      link.download = safeFileName(doc.fileName || doc.name || "approved-package");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(objectUrl);
      return;
    } catch {
      const link = document.createElement("a");
      link.href = doc.fileDataUrl;
      link.download = safeFileName(doc.fileName || doc.name || "approved-package");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }
  }

  const fallbackText = doc.textContent?.trim()
    ? doc.textContent
    : [
        `Approved Package: ${doc.name}`,
        `Category: ${doc.category}`,
        `Workflow Stage: ${doc.workflowStage || "HML Registry"}`,
        `Uploaded By: ${doc.uploadedBy}`,
        `Uploaded At: ${formatDate(doc.uploadedAt)}`,
        "",
        doc.note || "This registry package only has metadata in this frontend demo state. The original binary file was not stored.",
      ].join("\n");

  const blob = new Blob([fallbackText], { type: "text/plain;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = objectUrl;
  link.download = ensureTxtExtension(safeFileName(doc.fileName || doc.name || "approved-package"));
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
    "No approved file package is linked to this registry record yet. Upload a workflow/final package before CCR final listing to enable package download.",
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
  const [search, setSearch] = useState("");
  const [previewId, setPreviewId] = useState<string | null>(null);

  const documents = useMemo(() => {
    const q = search.toLowerCase();

    return state.documents.filter((doc) => {
      const project = state.projects.find((item) => item.id === doc.projectId);
      const workRequest = state.workRequests.find((item) => item.id === doc.workRequestId);

      const searchableText = [
        doc.name,
        doc.category,
        doc.listedBy,
        project?.code,
        project?.name,
        workRequest?.code,
        workRequest?.title,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return !q || searchableText.includes(q);
    });
  }, [search, state.documents, state.projects, state.workRequests]);

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

  const preview = state.documents.find((doc) => doc.id === previewId) as RegistryRecordWithPackage | undefined;
  const previewProject = preview ? state.projects.find((project) => project.id === preview.projectId) : undefined;
  const previewRequest = preview ? state.workRequests.find((request) => request.id === preview.workRequestId) : undefined;
  const previewPackage = preview ? findApprovedPackage(preview) : undefined;

  const handleDownloadApprovedPackage = (record: RegistryRecordWithPackage) => {
    const approvedPackage = findApprovedPackage(record);

    if (approvedPackage) {
      void downloadAttachment(approvedPackage);
      return;
    }

    downloadRegistryFallback(record);
  };

  return (
    <div>
      <PageHeader title="HML Registry" description="Final document registry with direct approved package download." />

      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search listed documents..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full rounded-lg border border-input bg-background py-2 pl-9 pr-4 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Document</th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Approved Package</th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Project</th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Work Request</th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Category</th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Listed By</th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Listed At</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>

            <tbody className="divide-y divide-border">
              {documents.map((doc) => {
                const registryRecord = doc as RegistryRecordWithPackage;
                const project = state.projects.find((item) => item.id === doc.projectId);
                const workRequest = state.workRequests.find((item) => item.id === doc.workRequestId);
                const approvedPackage = findApprovedPackage(registryRecord);

                return (
                  <tr key={doc.id} className="transition-colors hover:bg-muted/30">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                          <FileText className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium text-card-foreground">{doc.name}</p>
                          <p className="text-xs text-muted-foreground">Final listed document</p>
                        </div>
                      </div>
                    </td>

                    <td className="px-5 py-3.5">
                      {approvedPackage ? (
                        <div>
                          <p className="font-medium text-card-foreground">{approvedPackage.fileName || approvedPackage.name}</p>
                          <p className="text-xs text-muted-foreground">
                            v{approvedPackage.version || 1} · {approvedPackage.workflowStage || "Workflow Package"} · {formatFileSize(approvedPackage.fileSize)}
                          </p>
                        </div>
                      ) : (
                        <div>
                          <p className="font-medium text-muted-foreground">No package linked</p>
                          <p className="text-xs text-muted-foreground">Registry summary fallback available</p>
                        </div>
                      )}
                    </td>

                    <td className="px-5 py-3.5 text-muted-foreground">{project ? getProjectLabel(project) : "Unknown"}</td>
                    <td className="px-5 py-3.5 text-muted-foreground">{workRequest?.code || "Unknown"}</td>
                    <td className="px-5 py-3.5 text-muted-foreground">{doc.category}</td>
                    <td className="px-5 py-3.5 text-muted-foreground">{doc.listedBy}</td>
                    <td className="px-5 py-3.5 text-muted-foreground">{formatDate(doc.listedAt)}</td>

                    <td className="px-5 py-3.5">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" className="cursor-pointer" onClick={() => setPreviewId(doc.id)}>
                          <Eye className="h-3.5 w-3.5" />
                          View
                        </Button>

                        <Button variant="outline" size="sm" className="cursor-pointer" onClick={() => handleDownloadApprovedPackage(registryRecord)}>
                          <Download className="h-3.5 w-3.5" />
                          Download Package
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {!documents.length && (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-muted-foreground">
                    No documents have been listed in the HML registry yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={!!preview} onOpenChange={() => setPreviewId(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>HML Registry Entry</DialogTitle>
          </DialogHeader>

          {preview ? (
            <div className="space-y-5 py-2">
              <div className="rounded-lg border border-border bg-muted/20 p-6 text-center">
                <FileText className="mx-auto h-12 w-12 text-primary" />
                <p className="mt-3 font-medium text-card-foreground">{preview.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">Official HML final document registry record</p>
              </div>

              <div className="grid gap-3 text-sm md:grid-cols-2">
                <p>
                  <span className="text-muted-foreground">Project:</span>{" "}
                  {previewProject ? getProjectLabel(previewProject) : "Unknown"}
                </p>
                <p>
                  <span className="text-muted-foreground">Work Request:</span>{" "}
                  {previewRequest?.code || "Unknown"}
                </p>
                <p>
                  <span className="text-muted-foreground">Category:</span> {preview.category}
                </p>
                <p>
                  <span className="text-muted-foreground">Listed By:</span> {preview.listedBy}
                </p>
                <p>
                  <span className="text-muted-foreground">Listed At:</span> {formatDate(preview.listedAt)}
                </p>
                <p>
                  <span className="text-muted-foreground">Status:</span> Final Listed
                </p>
              </div>

              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <PackageCheck className="h-4 w-4 text-primary" />
                    </div>

                    <div>
                      <p className="font-medium text-card-foreground">Approved File Package</p>
                      {previewPackage ? (
                        <>
                          <p className="mt-1 text-sm text-card-foreground">{previewPackage.fileName || previewPackage.name}</p>
                          <p className="text-xs text-muted-foreground">
                            v{previewPackage.version || 1} · {previewPackage.workflowStage || "Workflow Package"} · Uploaded by{" "}
                            {previewPackage.uploadedBy} · {formatDate(previewPackage.uploadedAt)}
                          </p>
                        </>
                      ) : (
                        <p className="mt-1 text-sm text-muted-foreground">
                          No approved package is linked yet. A registry summary can still be downloaded.
                        </p>
                      )}
                    </div>
                  </div>

                  <Button className="cursor-pointer" onClick={() => handleDownloadApprovedPackage(preview)}>
                    <Download className="h-4 w-4" />
                    Download Approved Package
                  </Button>
                </div>
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
