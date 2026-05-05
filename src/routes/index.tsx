import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/StatusBadge";
import { WorkflowTimeline } from "@/components/WorkflowTimeline";
import { Button } from "@/components/ui/button";
import { FolderKanban, ClipboardList, FileText, Users, Plus, ArrowRight } from "lucide-react";
import { actorCanManageProjects, formatDate, getProjectLabel, statusToSimple, usePortal } from "@/lib/portal-data";

export const Route = createFileRoute("/")({
  component: Dashboard,
  head: () => ({
    meta: [
      { title: "Dashboard — Project Portal" },
      { name: "description", content: "Workflow-driven project management portal dashboard" },
    ],
  }),
});

function Dashboard() {
  const { state, currentActor } = usePortal();
  const canManage = actorCanManageProjects(currentActor.role);
  const latestProject = state.projects[0];
  const latestRequest = state.workRequests[0];
  const recentProjects = state.projects.slice(0, 4);
  const recentActivity = state.workRequests.flatMap((request) => request.revisionHistory.slice(0, 2).map((entry) => ({ request, entry }))).sort((a, b) => b.entry.at.localeCompare(a.entry.at)).slice(0, 6);
  const activeWorkflowSteps = latestRequest
    ? [
        { label: "Request", department: "CCR", status: "completed" as const, timestamp: formatDate(latestRequest.revisionHistory[latestRequest.revisionHistory.length - 1]?.at || latestRequest.lastTransferredAt) },
        { label: "Division", department: "ECM / PMO", status: ["DIVISION_NOTIFIED", "LEADER_ASSIGNED", "MEMBER_REVIEW"].includes(latestRequest.currentStatus) ? "active" as const : (latestRequest.currentStatus === "CREATED" ? "pending" as const : "completed" as const) },
        { label: "TMS", department: "TMS", status: ["FORWARDED_TO_TMS", "TMS_ASSIGNED", "DRAWING_IN_PROGRESS", "CHECKING_REVIEW", "APPROVAL_REVIEW"].includes(latestRequest.currentStatus) ? "active" as const : (["RETURNED_TO_DIVISION", "DIVISION_MEMBER_APPROVED", "DIVISION_MANAGER_APPROVED", "FORWARDED_TO_CCR", "HML_LISTED"].includes(latestRequest.currentStatus) ? "completed" as const : "pending" as const) },
        { label: "Division Approval", department: "ECM / PMO", status: ["RETURNED_TO_DIVISION", "DIVISION_MEMBER_APPROVED", "DIVISION_MANAGER_APPROVED"].includes(latestRequest.currentStatus) ? "active" as const : (["FORWARDED_TO_CCR", "HML_LISTED"].includes(latestRequest.currentStatus) ? "completed" as const : "pending" as const) },
        { label: "CCR Closeout", department: "CCR", status: latestRequest.currentStatus === "FORWARDED_TO_CCR" ? "active" as const : (latestRequest.currentStatus === "HML_LISTED" ? "completed" as const : "pending" as const) },
        { label: "HML List", department: "Documents", status: latestRequest.currentStatus === "HML_LISTED" ? "completed" as const : "pending" as const },
      ]
    : [];

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Operational overview for CCR, ECM, PMO, TMS, and HML document listing."
        actions={
          canManage ? (
            <Link to="/projects">
              <Button>
                <Plus className="h-4 w-4" />
                New Bid / Project
              </Button>
            </Link>
          ) : undefined
        }
      />

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Active Bids / Projects" value={state.projects.length} icon={FolderKanban} trend={{ value: `${state.projects.filter((project) => project.status === "BIDDING").length} bidding`, positive: true }} />
        <StatCard title="Work Requests" value={state.workRequests.length} icon={ClipboardList} trend={{ value: `${state.workRequests.filter((request) => request.currentStatus !== "HML_LISTED").length} in flow`, positive: true }} />
        <StatCard title="Documents Listed" value={state.documents.length} icon={FileText} trend={{ value: `${state.documents.length} in HML registry`, positive: true }} />
        <StatCard title="Active Members" value={state.members.filter((member) => member.active).length} icon={Users} trend={{ value: `${state.teams.length} teams`, positive: true }} />
      </div>

      {latestRequest && (
        <div className="mb-8 rounded-xl border border-border bg-card p-5">
          <h2 className="mb-2 text-sm font-semibold text-card-foreground">Active Workflow — {latestRequest.code}</h2>
          <p className="mb-4 text-sm text-muted-foreground">{latestRequest.title} under {latestProject ? getProjectLabel(latestProject) : "Unknown parent"}</p>
          <WorkflowTimeline steps={activeWorkflowSteps} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold text-card-foreground">Recent Projects</h2>
            <Link to="/projects" className="flex items-center gap-1 text-xs text-primary hover:underline">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="divide-y divide-border">
            {recentProjects.map((project) => (
              <div key={project.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-muted-foreground">{project.code}</span>
                    <StatusBadge status={project.status === "BIDDING" ? "active" : project.status === "ACTIVE" ? "in-progress" : project.status === "COMPLETED" ? "completed" : "draft"} />
                  </div>
                  <p className="mt-0.5 text-sm font-medium text-card-foreground">{project.name}</p>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <p>{formatDate(project.createdAt)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold text-card-foreground">Recent Routing Activity</h2>
          </div>
          <div className="divide-y divide-border">
            {recentActivity.map(({ request, entry }) => (
              <div key={entry.id} className="px-5 py-3">
                <div className="flex items-center gap-2">
                  <StatusBadge status={statusToSimple(request.currentStatus)} />
                  <span className="text-xs font-mono text-muted-foreground">{request.code}</span>
                </div>
                <p className="mt-1 text-sm font-medium text-card-foreground">{entry.action}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{entry.by} · {formatDate(entry.at)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
