import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Bell, ArrowRight, CheckCircle, UploadCloud, FileCheck, ListChecks, CheckCheck } from "lucide-react";
import {
  formatDate,
  getWorkRequestStatusLabel,
  type Actor,
  type HistoryEntry,
  type PortalState,
  type WorkRequest,
  usePortal,
} from "@/lib/portal-data";
import { cn } from "@/lib/utils";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/notifications")({
  component: NotificationsPage,
  head: () => ({
    meta: [{ title: "Notifications — Project Portal" }],
  }),
});

const NOTIFICATION_READ_EVENT = "portal-notifications-read-change";
const NOTIFICATION_INBOX_EVENT = "portal-notification-inbox-change";

type NotificationTargetView = "focus" | "details";

type ProjectNotificationItem = {
  id: string;
  kind: "project";
  projectId: string;
  title: string;
  subtitle: string;
  roleMessage: string;
  at: string;
  by: string;
};

type RequestNotificationItem = {
  id: string;
  kind: "request";
  requestId: string;
  status: string;
  statusLabel: string;
  title: string;
  subtitle: string;
  roleMessage: string;
  at: string;
  by: string;
  targetView: NotificationTargetView;
  request?: WorkRequest;
  latest?: HistoryEntry;
};

type NotificationItem = ProjectNotificationItem | RequestNotificationItem;

function getNotificationReadStorageKey(actorId: string) {
  return `project-portal-read-notifications-${actorId}`;
}

function getNotificationInboxStorageKey(actorId: string) {
  return `project-portal-notification-inbox-${actorId}`;
}

function loadReadNotificationIds(actorId: string) {
  if (typeof window === "undefined") return new Set<string>();

  try {
    const raw = window.localStorage.getItem(getNotificationReadStorageKey(actorId));
    const parsed = raw ? (JSON.parse(raw) as string[]) : [];
    return new Set(parsed);
  } catch {
    return new Set<string>();
  }
}

function saveReadNotificationIds(actorId: string, ids: Set<string>) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(getNotificationReadStorageKey(actorId), JSON.stringify([...ids]));
  window.dispatchEvent(new Event(NOTIFICATION_READ_EVENT));
}

function toStoredNotification(item: NotificationItem): NotificationItem {
  if (item.kind === "project") {
    return {
      id: item.id,
      kind: item.kind,
      projectId: item.projectId,
      title: item.title,
      subtitle: item.subtitle,
      roleMessage: item.roleMessage,
      at: item.at,
      by: item.by,
    };
  }

  return {
    id: item.id,
    kind: item.kind,
    requestId: item.requestId,
    status: item.status,
    statusLabel: item.statusLabel,
    title: item.title,
    subtitle: item.subtitle,
    roleMessage: item.roleMessage,
    at: item.at,
    by: item.by,
    targetView: item.targetView,
  };
}

function loadNotificationInbox(actorId: string): NotificationItem[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(getNotificationInboxStorageKey(actorId));
    const parsed = raw ? (JSON.parse(raw) as NotificationItem[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveNotificationInbox(actorId: string, notifications: NotificationItem[]) {
  if (typeof window === "undefined") return;

  const storedNotifications = notifications.map(toStoredNotification).slice(0, 150);
  window.localStorage.setItem(getNotificationInboxStorageKey(actorId), JSON.stringify(storedNotifications));
  window.dispatchEvent(new Event(NOTIFICATION_INBOX_EVENT));
}

function mergeNotifications(stored: NotificationItem[], live: NotificationItem[]) {
  const map = new Map<string, NotificationItem>();

  stored.forEach((item) => {
    map.set(item.id, toStoredNotification(item));
  });

  live.forEach((item) => {
    const previous = map.get(item.id);

    map.set(item.id, {
      ...previous,
      ...toStoredNotification(item),
    } as NotificationItem);
  });

  return [...map.values()].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 150);
}

function areNotificationListsEqual(a: NotificationItem[], b: NotificationItem[]) {
  return JSON.stringify(a.map(toStoredNotification)) === JSON.stringify(b.map(toStoredNotification));
}

function actorHasWorkAction(request: WorkRequest, currentActor: Actor) {
  switch (currentActor.role) {
    case "system_admin":
    case "prime_consultant":
      return request.currentStatus !== "HML_LISTED";

    case "ccr_coordinator":
      return request.currentStatus === "FORWARDED_TO_CCR";

    case "division_lead":
      return ["DIVISION_NOTIFIED", "LEADER_ASSIGNED", "DIVISION_MEMBER_APPROVED", "DIVISION_MANAGER_APPROVED"].includes(request.currentStatus);

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

    default:
      return false;
  }
}

function getRoleBasedMessage(request: WorkRequest, currentActor: Actor) {
  const hasAction = actorHasWorkAction(request, currentActor);

  if (!hasAction) {
    return "You do not have an action for this item. Click to view the details.";
  }

  switch (currentActor.role) {
    case "system_admin":
    case "prime_consultant":
      return "Supervisor work access is available. Click to open the related module.";

    case "ccr_coordinator":
      return "CCR final listing work is waiting. Click to open the related module.";

    case "division_lead":
      if (request.currentStatus === "DIVISION_NOTIFIED") return "A new request arrived for your division. Click to open the Work Requests module.";
      if (request.currentStatus === "LEADER_ASSIGNED") return "Division lead assignment is done. Click to continue member assignment.";
      if (request.currentStatus === "DIVISION_MEMBER_APPROVED") return "Division member approved the package. Click to continue manager approval.";
      if (request.currentStatus === "DIVISION_MANAGER_APPROVED") return "Manager approval is complete. Click to forward this package to CCR.";
      return "Division lead work access is available. Click to open the module.";

    case "division_member":
      if (request.currentStatus === "MEMBER_REVIEW") return "You have been assigned for review. Click to open the Work Requests module.";
      if (request.currentStatus === "RETURNED_TO_DIVISION") return "TMS returned the package. Click to review it from the Work Requests module.";
      return "Division member work access is available. Click to open the module.";

    case "tms_manager":
      return "TMS manager assignment is waiting. Click to open the Work Requests module.";

    case "tms_drawing":
      return "TMS-M1 drawing work is assigned to you. Click to open the Work Requests module.";

    case "tms_checking":
      return "TMS-M2 checking is waiting. Click to open the Work Requests module.";

    case "tms_approval":
      return "TMS-M3 approval is waiting. Click to open the Work Requests module.";

    default:
      return "Click to open the related module.";
  }
}

function getLiveActorNotifications(state: PortalState, currentActor: Actor): NotificationItem[] {
  const requestNotifications: NotificationItem[] = state.workRequests.flatMap((request) => {
    const latest = request.revisionHistory[0];

    const relevant = (() => {
      switch (currentActor.role) {
        case "system_admin":
        case "prime_consultant":
          return Boolean(latest);

        case "ccr_coordinator":
          return request.currentStatus === "FORWARDED_TO_CCR" || request.currentStatus === "HML_LISTED";

        case "division_lead":
          return ["DIVISION_NOTIFIED", "LEADER_ASSIGNED", "DIVISION_MEMBER_APPROVED", "DIVISION_MANAGER_APPROVED"].includes(request.currentStatus);

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

    const hasAction = actorHasWorkAction(request, currentActor);

    return [
      {
        id: latest.id,
        kind: "request" as const,
        requestId: request.id,
        request,
        latest,
        status: request.currentStatus,
        statusLabel: getWorkRequestStatusLabel(request.currentStatus),
        title: `${request.code} · ${request.title}`,
        subtitle: latest.action,
        roleMessage: getRoleBasedMessage(request, currentActor),
        at: latest.at,
        by: latest.by,
        targetView: hasAction ? "focus" : "details",
      },
    ];
  });

  const onboardingNotifications: NotificationItem[] = state.projects.flatMap((project) => {
    const projectRelevant = (() => {
      if (["system_admin", "prime_consultant", "ccr_coordinator"].includes(currentActor.role)) return project.credentialsSent;
      return currentActor.role === "client_owner" && currentActor.clientId === project.clientId && project.credentialsSent;
    })();

    if (!projectRelevant) return [];

    return [
      {
        id: `onboard-${project.id}`,
        kind: "project" as const,
        projectId: project.id,
        title: `${project.code} onboarding credentials prepared`,
        subtitle:
          currentActor.role === "client_owner"
            ? "Your access credentials were generated for project/bid collaboration."
            : `Credentials prepared for ${project.clientEmail}.`,
        roleMessage:
          currentActor.role === "client_owner"
            ? "Click to open your accessible Projects/Bids area."
            : "Click to open Projects/Bids and review the client onboarding record.",
        at: project.createdAt,
        by: "CCR Coordinator",
      },
    ];
  });

  return [...onboardingNotifications, ...requestNotifications].sort((a, b) => b.at.localeCompare(a.at));
}

function iconForStatus(status: string) {
  if (status === "FORWARDED_TO_TMS") return UploadCloud;
  if (status === "FORWARDED_TO_CCR") return ArrowRight;
  if (status === "HML_LISTED") return ListChecks;
  if (status.includes("APPROVED")) return CheckCircle;
  return FileCheck;
}

function NotificationsPage() {
  const { state, currentActor } = usePortal();
  const navigate = useNavigate();
  const [readNotificationIds, setReadNotificationIds] = useState<Set<string>>(() => loadReadNotificationIds(currentActor.id));
  const [storedNotifications, setStoredNotifications] = useState<NotificationItem[]>(() => loadNotificationInbox(currentActor.id));

  useEffect(() => {
    setReadNotificationIds(loadReadNotificationIds(currentActor.id));
    setStoredNotifications(loadNotificationInbox(currentActor.id));
  }, [currentActor.id]);

  const liveNotifications = useMemo(() => getLiveActorNotifications(state, currentActor), [state, currentActor]);

  const notifications = useMemo(
    () => mergeNotifications(storedNotifications, liveNotifications),
    [storedNotifications, liveNotifications]
  );

  useEffect(() => {
    const merged = mergeNotifications(storedNotifications, liveNotifications);

    if (!areNotificationListsEqual(storedNotifications, merged)) {
      setStoredNotifications(merged);
      saveNotificationInbox(currentActor.id, merged);
    }
  }, [currentActor.id, storedNotifications, liveNotifications]);

  const unreadCount = useMemo(
    () => notifications.filter((item) => !readNotificationIds.has(item.id)).length,
    [notifications, readNotificationIds]
  );

  const updateReadIds = (nextIds: Set<string>) => {
    setReadNotificationIds(new Set(nextIds));
    saveReadNotificationIds(currentActor.id, nextIds);
  };

  const markRead = (id: string) => {
    if (readNotificationIds.has(id)) return;

    const nextIds = new Set(readNotificationIds);
    nextIds.add(id);
    updateReadIds(nextIds);
  };

  const handleOpenNotification = (item: NotificationItem) => {
    markRead(item.id);

    if (item.kind === "request") {
      void navigate({
        to: "/work-requests",
        search: {
          requestId: item.requestId,
          view: item.targetView,
        },
      });
      return;
    }

    void navigate({ to: "/projects" });
  };

  const handleMarkAllRead = () => {
    const nextIds = new Set(readNotificationIds);

    notifications.forEach((item) => {
      nextIds.add(item.id);
    });

    updateReadIds(nextIds);
    toast.success("All notifications marked as read");
  };

  return (
    <div>
      <PageHeader
        title="Notifications"
        description="Role-based operational queues and pending actions."
        actions={
          unreadCount > 0 ? (
            <Button variant="outline" size="sm" className="cursor-pointer" onClick={handleMarkAllRead}>
              <CheckCheck className="h-4 w-4" />
              Mark all read
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div
          className={cn(
            "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm",
            unreadCount > 0
              ? "border-destructive/30 bg-destructive/10 text-destructive"
              : "border-border bg-muted/30 text-muted-foreground"
          )}
        >
          <span
            className={cn(
              "flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold leading-none",
              unreadCount > 0 ? "bg-destructive text-destructive-foreground" : "bg-muted text-muted-foreground"
            )}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
          unread notification{unreadCount === 1 ? "" : "s"}
        </div>

        <p className="text-xs text-muted-foreground">
          Notifications stay here after opening. Opened notifications are marked as read.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {notifications.length ? (
          <div className="divide-y divide-border">
            {notifications.map((item) => {
              const isUnread = !readNotificationIds.has(item.id);
              const Icon = item.kind === "project" ? Bell : iconForStatus(item.status);

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleOpenNotification(item)}
                  className={cn(
                    "group flex w-full cursor-pointer items-start gap-4 px-5 py-4 text-left transition-colors hover:bg-muted/20",
                    isUnread && "bg-primary/[0.04]"
                  )}
                >
                  <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" />
                    {isUnread ? <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-destructive ring-2 ring-card" /> : null}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className={cn("text-sm text-card-foreground", isUnread ? "font-semibold" : "font-medium")}>
                        {item.title}
                      </p>

                      {isUnread ? (
                        <span className="rounded-full bg-destructive px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-destructive-foreground">
                          New
                        </span>
                      ) : (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Read
                        </span>
                      )}
                    </div>

                    {item.kind === "request" ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">{item.statusLabel}</p>
                    ) : null}

                    <p className="mt-2 text-sm text-card-foreground">{item.subtitle}</p>
                    <p className="mt-1 text-sm font-medium text-primary">{item.roleMessage}</p>

                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>
                        {item.by} · {formatDate(item.at)}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5">
                        <ArrowRight className="h-3 w-3" />
                        Open related item
                      </span>
                    </div>
                  </div>
                </button>
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

// import { createFileRoute } from "@tanstack/react-router";
// import { PageHeader } from "@/components/PageHeader";
// import { Bell, ArrowRight, CheckCircle, UploadCloud, FileCheck, ListChecks } from "lucide-react";
// import { formatDate, getWorkRequestStatusLabel, usePortal } from "@/lib/portal-data";

// export const Route = createFileRoute("/notifications")({
//   component: NotificationsPage,
//   head: () => ({
//     meta: [{ title: "Notifications — Project Portal" }],
//   }),
// });

// function NotificationsPage() {
//   const { state, currentActor } = usePortal();

//   const requestNotifications = state.workRequests.flatMap((request) => {
//     const latest = request.revisionHistory[0];
//     const relevant = (() => {
//       switch (currentActor.role) {
//         case "system_admin":
//         case "prime_consultant":
//         case "ccr_coordinator":
//           return request.currentStatus === "FORWARDED_TO_CCR" || request.currentStatus === "HML_LISTED";
//         case "division_lead":
//           return ["DIVISION_NOTIFIED", "DIVISION_MEMBER_APPROVED"].includes(request.currentStatus);
//         case "division_member":
//           return request.assignedMemberId === currentActor.memberId && ["MEMBER_REVIEW", "RETURNED_TO_DIVISION"].includes(request.currentStatus);
//         case "tms_manager":
//           return request.currentStatus === "FORWARDED_TO_TMS";
//         case "tms_drawing":
//           return request.tmsAssignments?.drawingId === currentActor.memberId && ["TMS_ASSIGNED", "DRAWING_IN_PROGRESS"].includes(request.currentStatus);
//         case "tms_checking":
//           return request.tmsAssignments?.checkingId === currentActor.memberId && request.currentStatus === "CHECKING_REVIEW";
//         case "tms_approval":
//           return request.tmsAssignments?.approvalId === currentActor.memberId && request.currentStatus === "APPROVAL_REVIEW";
//         case "client_owner":
//           return false;
//         default:
//           return false;
//       }
//     })();
//     if (!relevant || !latest) return [];
//     return [{ request, latest }];
//   });

//   const iconForStatus = (status: string) => {
//     if (status === "FORWARDED_TO_TMS") return UploadCloud;
//     if (status === "FORWARDED_TO_CCR") return ArrowRight;
//     if (status === "HML_LISTED") return ListChecks;
//     if (status.includes("APPROVED")) return CheckCircle;
//     return FileCheck;
//   };

//   const onboardingNotifications = state.projects.flatMap((project) => {
//     const projectRelevant = (() => {
//       if (["system_admin", "prime_consultant", "ccr_coordinator"].includes(currentActor.role)) return project.credentialsSent;
//       return currentActor.role === "client_owner" && currentActor.clientId === project.clientId && project.credentialsSent;
//     })();
//     if (!projectRelevant) return [];
//     return [{
//       id: `onboard-${project.id}`,
//       kind: "project" as const,
//       title: `${project.code} onboarding credentials prepared`,
//       subtitle: currentActor.role === "client_owner" ? "Your access credentials were generated for project/bid collaboration." : `Credentials prepared for ${project.clientEmail}.`,
//       at: project.createdAt,
//       by: "CCR Coordinator",
//     }];
//   });

//   const notifications = [
//     ...onboardingNotifications,
//     ...requestNotifications.map(({ request, latest }) => ({
//       id: latest.id,
//       kind: "request" as const,
//       request,
//       latest,
//       title: `${request.code} · ${request.title}`,
//       subtitle: latest.action,
//       at: latest.at,
//       by: latest.by,
//     })),
//   ].sort((a, b) => b.at.localeCompare(a.at));

//   return (
//     <div>
//       <PageHeader title="Notifications" description="Operational queues and pending actions based on the active actor." />
//       <div className="rounded-xl border border-border bg-card overflow-hidden">
//         {notifications.length ? (
//           <div className="divide-y divide-border">
//             {notifications.map((item) => {
//               const Icon = item.kind === "project" ? Bell : iconForStatus(item.request.currentStatus);
//               return (
//                 <div key={item.id} className="flex items-start gap-4 px-5 py-4 hover:bg-muted/20 transition-colors">
//                   <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
//                     <Icon className="h-4 w-4" />
//                   </div>
//                   <div className="flex-1">
//                     <p className="text-sm font-medium text-card-foreground">{item.title}</p>
//                     {item.kind === "request" ? <p className="mt-0.5 text-xs text-muted-foreground">{getWorkRequestStatusLabel(item.request.currentStatus)}</p> : null}
//                     <p className="mt-2 text-sm text-card-foreground">{item.subtitle}</p>
//                     <p className="mt-1 text-xs text-muted-foreground">{item.by} · {formatDate(item.at)}</p>
//                   </div>
//                 </div>
//               );
//             })}
//           </div>
//         ) : (
//           <div className="px-5 py-12 text-center text-muted-foreground">
//             <Bell className="mx-auto mb-2 h-8 w-8 opacity-30" />
//             <p className="text-sm">No queue items for the current actor.</p>
//           </div>
//         )}
//       </div>
//     </div>
//   );
// }
