import { Link, useLocation } from "@tanstack/react-router";
import {
  LayoutDashboard,
  FolderKanban,
  ClipboardList,
  Users,
  Building2,
  FileText,
  Bell,
  Settings,
  Ship,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { type Actor, type PortalState, usePortal } from "@/lib/portal-data";

type SidebarNotificationItem = {
  id: string;
  at: string;
};

const NOTIFICATION_READ_EVENT = "portal-notifications-read-change";

const roleVisibility: Record<string, string[]> = {
  system_admin: ["/", "/notifications", "/projects", "/work-requests", "/documents", "/companies", "/teams", "/settings"],
  prime_consultant: ["/", "/notifications", "/projects", "/work-requests", "/documents", "/companies", "/teams", "/settings"],
  ccr_coordinator: ["/", "/notifications", "/projects", "/work-requests", "/documents"],
  division_lead: ["/", "/notifications", "/work-requests", "/documents", "/teams"],
  division_member: ["/", "/notifications", "/work-requests", "/documents"],
  tms_manager: ["/", "/notifications", "/work-requests", "/documents", "/teams"],
  tms_drawing: ["/", "/notifications", "/work-requests", "/documents"],
  tms_checking: ["/", "/notifications", "/work-requests", "/documents"],
  tms_approval: ["/", "/notifications", "/work-requests", "/documents"],
  client_owner: ["/", "/notifications", "/projects", "/work-requests", "/documents"],
};

const navSections = [
  {
    label: "Overview",
    items: [
      { icon: LayoutDashboard, label: "Dashboard", to: "/" },
      { icon: Bell, label: "Notifications", to: "/notifications" },
    ],
  },
  {
    label: "Project Management",
    items: [
      { icon: FolderKanban, label: "Projects & Bids", to: "/projects" },
      { icon: ClipboardList, label: "Work Requests", to: "/work-requests" },
      { icon: FileText, label: "Documents", to: "/documents" },
    ],
  },
  {
    label: "Organization",
    items: [
      { icon: Building2, label: "Companies & Divisions", to: "/companies" },
      { icon: Users, label: "Teams & Members", to: "/teams" },
    ],
  },
  {
    label: "System",
    items: [{ icon: Settings, label: "Settings", to: "/settings" }],
  },
];

function getNotificationReadStorageKey(actorId: string) {
  return `project-portal-read-notifications-${actorId}`;
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

function getActorNotifications(state: PortalState, currentActor: Actor): SidebarNotificationItem[] {
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

    return [
      {
        id: latest.id,
        at: latest.at,
      },
    ];
  });

  const onboardingNotifications = state.projects.flatMap((project) => {
    const projectRelevant = (() => {
      if (["system_admin", "prime_consultant", "ccr_coordinator"].includes(currentActor.role)) return project.credentialsSent;
      return currentActor.role === "client_owner" && currentActor.clientId === project.clientId && project.credentialsSent;
    })();

    if (!projectRelevant) return [];

    return [
      {
        id: `onboard-${project.id}`,
        at: project.createdAt,
      },
    ];
  });

  return [...onboardingNotifications, ...requestNotifications].sort((a, b) => b.at.localeCompare(a.at));
}

export function AppSidebar() {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const { state, currentActor } = usePortal();
  const [readNotificationIds, setReadNotificationIds] = useState<Set<string>>(() => loadReadNotificationIds(currentActor.id));

  const visibleRoutes = roleVisibility[currentActor.role] || roleVisibility.prime_consultant;

  const notifications = useMemo(() => getActorNotifications(state, currentActor), [state, currentActor]);

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !readNotificationIds.has(notification.id)).length,
    [notifications, readNotificationIds]
  );

  useEffect(() => {
    const syncReadNotifications = () => {
      setReadNotificationIds(loadReadNotificationIds(currentActor.id));
    };

    syncReadNotifications();

    window.addEventListener("storage", syncReadNotifications);
    window.addEventListener(NOTIFICATION_READ_EVENT, syncReadNotifications);

    return () => {
      window.removeEventListener("storage", syncReadNotifications);
      window.removeEventListener(NOTIFICATION_READ_EVENT, syncReadNotifications);
    };
  }, [currentActor.id]);

  const renderUnreadBadge = (compact = false) => {
    if (!unreadCount) return null;

    const displayCount = unreadCount > 99 ? "99+" : unreadCount;

    if (compact) {
      return (
        <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold leading-none text-destructive-foreground shadow-sm ring-2 ring-sidebar">
          {displayCount}
        </span>
      );
    }

    return (
      <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-bold leading-none text-destructive-foreground shadow-sm">
        {displayCount}
      </span>
    );
  };

  return (
    <aside
      className={cn(
        "flex h-screen flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-all duration-200",
        collapsed ? "w-16" : "w-72"
      )}
    >
      <button
        type="button"
        onClick={() => setCollapsed((prev) => !prev)}
        className="flex cursor-pointer items-center gap-3 px-4 py-5 border-b border-sidebar-border text-left"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary">
          <Ship className="h-4 w-4 text-sidebar-primary-foreground" />
        </div>
        {!collapsed && (
          <div>
            <h1 className="text-sm font-semibold text-sidebar-foreground">Project Portal</h1>
            <p className="text-xs text-sidebar-foreground/60">Workflow Management</p>
          </div>
        )}
      </button>

      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {navSections.map((section) => (
          <div key={section.label} className="mb-4">
            {!collapsed && (
              <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
                {section.label}
              </p>
            )}

            {section.items.filter((item) => visibleRoutes.includes(item.to)).map((item) => {
              const isActive = location.pathname === item.to || (item.to !== "/" && location.pathname.startsWith(item.to));
              const isNotificationItem = item.to === "/notifications";

              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "relative flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors mb-0.5",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                  )}
                >
                  <span className="relative inline-flex">
                    <item.icon className="h-4 w-4 shrink-0" />
                    {collapsed && isNotificationItem ? renderUnreadBadge(true) : null}
                  </span>

                  {!collapsed && <span>{item.label}</span>}
                  {!collapsed && isNotificationItem ? renderUnreadBadge(false) : null}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="border-t border-sidebar-border px-3 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sidebar-accent text-xs font-medium text-sidebar-accent-foreground">
            {currentActor.label
              .split(" ")
              .slice(0, 2)
              .map((part) => part[0])
              .join("")}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate">{currentActor.label}</p>
              <p className="text-xs text-sidebar-foreground/50 truncate">Operational Actor</p>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}


// import { Link, useLocation } from "@tanstack/react-router";
// import {
//   LayoutDashboard,
//   FolderKanban,
//   ClipboardList,
//   Users,
//   Building2,
//   FileText,
//   Bell,
//   Settings,
//   Ship,
// } from "lucide-react";
// import { useState } from "react";
// import { cn } from "@/lib/utils";
// import { usePortal } from "@/lib/portal-data";

// const roleVisibility: Record<string, string[]> = {
//   system_admin: ["/", "/notifications", "/projects", "/work-requests", "/documents", "/companies", "/teams", "/settings"],
//   prime_consultant: ["/", "/notifications", "/projects", "/work-requests", "/documents", "/companies", "/teams", "/settings"],
//   ccr_coordinator: ["/", "/notifications", "/projects", "/work-requests", "/documents"],
//   division_lead: ["/", "/notifications", "/work-requests", "/documents", "/teams"],
//   division_member: ["/", "/notifications", "/work-requests", "/documents"],
//   tms_manager: ["/", "/notifications", "/work-requests", "/documents", "/teams"],
//   tms_drawing: ["/", "/notifications", "/work-requests", "/documents"],
//   tms_checking: ["/", "/notifications", "/work-requests", "/documents"],
//   tms_approval: ["/", "/notifications", "/work-requests", "/documents"],
//   client_owner: ["/", "/notifications", "/projects", "/work-requests", "/documents"],
// };

// const navSections = [
//   {
//     label: "Overview",
//     items: [
//       { icon: LayoutDashboard, label: "Dashboard", to: "/" },
//       { icon: Bell, label: "Notifications", to: "/notifications" },
//     ],
//   },
//   {
//     label: "Project Management",
//     items: [
//       { icon: FolderKanban, label: "Projects & Bids", to: "/projects" },
//       { icon: ClipboardList, label: "Work Requests", to: "/work-requests" },
//       { icon: FileText, label: "Documents", to: "/documents" },
//     ],
//   },
//   {
//     label: "Organization",
//     items: [
//       { icon: Building2, label: "Companies & Divisions", to: "/companies" },
//       { icon: Users, label: "Teams & Members", to: "/teams" },
//     ],
//   },
//   {
//     label: "System",
//     items: [{ icon: Settings, label: "Settings", to: "/settings" }],
//   },
// ];

// export function AppSidebar() {
//   const location = useLocation();
//   const [collapsed, setCollapsed] = useState(false);
//   const { currentActor } = usePortal();

//   const visibleRoutes = roleVisibility[currentActor.role] || roleVisibility.prime_consultant;

//   return (
//     <aside
//       className={cn(
//         "flex h-screen flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-all duration-200",
//         collapsed ? "w-16" : "w-72"
//       )}
//     >
//       <button
//         type="button"
//         onClick={() => setCollapsed((prev) => !prev)}
//         className="flex items-center gap-3 px-4 py-5 border-b border-sidebar-border text-left"
//       >
//         <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary">
//           <Ship className="h-4 w-4 text-sidebar-primary-foreground" />
//         </div>
//         {!collapsed && (
//           <div>
//             <h1 className="text-sm font-semibold text-sidebar-foreground">Project Portal</h1>
//             <p className="text-xs text-sidebar-foreground/60">Workflow Management</p>
//           </div>
//         )}
//       </button>

//       <nav className="flex-1 overflow-y-auto py-3 px-2">
//         {navSections.map((section) => (
//           <div key={section.label} className="mb-4">
//             {!collapsed && (
//               <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
//                 {section.label}
//               </p>
//             )}
//             {section.items.filter((item) => visibleRoutes.includes(item.to)).map((item) => {
//               const isActive = location.pathname === item.to || (item.to !== "/" && location.pathname.startsWith(item.to));
//               return (
//                 <Link
//                   key={item.to}
//                   to={item.to}
//                   className={cn(
//                     "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors mb-0.5",
//                     isActive
//                       ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
//                       : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
//                   )}
//                 >
//                   <item.icon className="h-4 w-4 shrink-0" />
//                   {!collapsed && <span>{item.label}</span>}
//                 </Link>
//               );
//             })}
//           </div>
//         ))}
//       </nav>

//       <div className="border-t border-sidebar-border px-3 py-3">
//         <div className="flex items-center gap-3">
//           <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sidebar-accent text-xs font-medium text-sidebar-accent-foreground">
//             {currentActor.label
//               .split(" ")
//               .slice(0, 2)
//               .map((part) => part[0])
//               .join("")}
//           </div>
//           {!collapsed && (
//             <div className="flex-1 min-w-0">
//               <p className="text-sm font-medium text-sidebar-foreground truncate">{currentActor.label}</p>
//               <p className="text-xs text-sidebar-foreground/50 truncate">Operational Actor</p>
//             </div>
//           )}
//         </div>
//       </div>
//     </aside>
//   );
// }
