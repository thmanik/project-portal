import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { Bell, ArrowRight, CheckCircle, UploadCloud, FileCheck, ListChecks } from "lucide-react";
import { formatDate, getWorkRequestStatusLabel, usePortal } from "@/lib/portal-data";

export const Route = createFileRoute("/notifications")({
  component: NotificationsPage,
  head: () => ({
    meta: [{ title: "Notifications — Project Portal" }],
  }),
});

function NotificationsPage() {
  const { state, currentActor } = usePortal();

  const requestNotifications = state.workRequests.flatMap((request) => {
    const latest = request.revisionHistory[0];
    const relevant = (() => {
      switch (currentActor.role) {
        case "system_admin":
        case "prime_consultant":
        case "ccr_coordinator":
          return request.currentStatus === "FORWARDED_TO_CCR" || request.currentStatus === "HML_LISTED";
        case "division_lead":
          return ["DIVISION_NOTIFIED", "DIVISION_MEMBER_APPROVED"].includes(request.currentStatus);
        case "division_member":
          return request.assignedMemberId === currentActor.memberId && ["MEMBER_REVIEW", "RETURNED_TO_DIVISION"].includes(request.currentStatus);
        case "tms_manager":
          return request.currentStatus === "FORWARDED_TO_TMS";
        case "tms_drawing":
          return request.tmsAssignments?.drawingId === currentActor.memberId && ["TMS_ASSIGNED", "DRAWING_IN_PROGRESS"].includes(request.currentStatus);
        case "tms_checking":
          return request.tmsAssignments?.checkingId === currentActor.memberId && request.currentStatus === "CHECKING_REVIEW";
        case "tms_approval":
          return request.tmsAssignments?.approvalId === currentActor.memberId && request.currentStatus === "APPROVAL_REVIEW";
        case "client_owner":
          return false;
        default:
          return false;
      }
    })();
    if (!relevant || !latest) return [];
    return [{ request, latest }];
  });

  const iconForStatus = (status: string) => {
    if (status === "FORWARDED_TO_TMS") return UploadCloud;
    if (status === "FORWARDED_TO_CCR") return ArrowRight;
    if (status === "HML_LISTED") return ListChecks;
    if (status.includes("APPROVED")) return CheckCircle;
    return FileCheck;
  };

  const onboardingNotifications = state.projects.flatMap((project) => {
    const projectRelevant = (() => {
      if (["system_admin", "prime_consultant", "ccr_coordinator"].includes(currentActor.role)) return project.credentialsSent;
      return currentActor.role === "client_owner" && currentActor.clientId === project.clientId && project.credentialsSent;
    })();
    if (!projectRelevant) return [];
    return [{
      id: `onboard-${project.id}`,
      kind: "project" as const,
      title: `${project.code} onboarding credentials prepared`,
      subtitle: currentActor.role === "client_owner" ? "Your access credentials were generated for project/bid collaboration." : `Credentials prepared for ${project.clientEmail}.`,
      at: project.createdAt,
      by: "CCR Coordinator",
    }];
  });

  const notifications = [
    ...onboardingNotifications,
    ...requestNotifications.map(({ request, latest }) => ({
      id: latest.id,
      kind: "request" as const,
      request,
      latest,
      title: `${request.code} · ${request.title}`,
      subtitle: latest.action,
      at: latest.at,
      by: latest.by,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div>
      <PageHeader title="Notifications" description="Operational queues and pending actions based on the active actor." />
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {notifications.length ? (
          <div className="divide-y divide-border">
            {notifications.map((item) => {
              const Icon = item.kind === "project" ? Bell : iconForStatus(item.request.currentStatus);
              return (
                <div key={item.id} className="flex items-start gap-4 px-5 py-4 hover:bg-muted/20 transition-colors">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-card-foreground">{item.title}</p>
                    {item.kind === "request" ? <p className="mt-0.5 text-xs text-muted-foreground">{getWorkRequestStatusLabel(item.request.currentStatus)}</p> : null}
                    <p className="mt-2 text-sm text-card-foreground">{item.subtitle}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{item.by} · {formatDate(item.at)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="px-5 py-12 text-center text-muted-foreground">
            <Bell className="mx-auto mb-2 h-8 w-8 opacity-30" />
            <p className="text-sm">No queue items for the current actor.</p>
          </div>
        )}
      </div>
    </div>
  );
}
