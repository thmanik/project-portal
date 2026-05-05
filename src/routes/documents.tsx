import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Search, Download, Eye, FileText } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDate, getProjectLabel, usePortal } from "@/lib/portal-data";

export const Route = createFileRoute("/documents")({
  component: DocumentsPage,
  head: () => ({
    meta: [{ title: "Documents — Project Portal" }],
  }),
});

function DocumentsPage() {
  const { state } = usePortal();
  const [search, setSearch] = useState("");
  const [previewId, setPreviewId] = useState<string | null>(null);

  const documents = useMemo(() => {
    const q = search.toLowerCase();
    return state.documents.filter((doc) => !q || doc.name.toLowerCase().includes(q) || doc.category.toLowerCase().includes(q));
  }, [search, state.documents]);

  const preview = state.documents.find((doc) => doc.id === previewId);
  const previewProject = preview ? state.projects.find((project) => project.id === preview.projectId) : undefined;
  const previewRequest = preview ? state.workRequests.find((request) => request.id === preview.workRequestId) : undefined;

  return (
    <div>
      <PageHeader title="Documents" description="Final HML document registry after CCR closeout." />

      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search listed documents..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-input bg-background pl-9 pr-4 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Document</th>
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
              const project = state.projects.find((item) => item.id === doc.projectId);
              const workRequest = state.workRequests.find((item) => item.id === doc.workRequestId);
              return (
                <tr key={doc.id} className="hover:bg-muted/30 transition-colors">
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
                  <td className="px-5 py-3.5 text-muted-foreground">{project ? getProjectLabel(project) : "Unknown"}</td>
                  <td className="px-5 py-3.5 text-muted-foreground">{workRequest?.code || "Unknown"}</td>
                  <td className="px-5 py-3.5 text-muted-foreground">{doc.category}</td>
                  <td className="px-5 py-3.5 text-muted-foreground">{doc.listedBy}</td>
                  <td className="px-5 py-3.5 text-muted-foreground">{formatDate(doc.listedAt)}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" size="sm" onClick={() => setPreviewId(doc.id)}><Eye className="h-3.5 w-3.5" />View</Button>
                      <Button variant="outline" size="sm"><Download className="h-3.5 w-3.5" />Download</Button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!documents.length && (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center text-muted-foreground">No documents have been listed in the HML registry yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={!!preview} onOpenChange={() => setPreviewId(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Document Registry Entry</DialogTitle>
          </DialogHeader>
          {preview && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg border border-border bg-muted/20 p-6 text-center">
                <FileText className="mx-auto h-12 w-12 text-primary" />
                <p className="mt-3 font-medium text-card-foreground">{preview.name}</p>
              </div>
              <div className="grid gap-3 text-sm md:grid-cols-2">
                <p><span className="text-muted-foreground">Project:</span> {previewProject ? getProjectLabel(previewProject) : "Unknown"}</p>
                <p><span className="text-muted-foreground">Work Request:</span> {previewRequest?.code || "Unknown"}</p>
                <p><span className="text-muted-foreground">Category:</span> {preview.category}</p>
                <p><span className="text-muted-foreground">Listed By:</span> {preview.listedBy}</p>
                <p><span className="text-muted-foreground">Listed At:</span> {formatDate(preview.listedAt)}</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
