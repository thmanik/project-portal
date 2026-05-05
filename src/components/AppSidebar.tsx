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
import { useState } from "react";
import { cn } from "@/lib/utils";
import { usePortal } from "@/lib/portal-data";

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

export function AppSidebar() {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const { currentActor } = usePortal();

  const visibleRoutes = roleVisibility[currentActor.role] || roleVisibility.prime_consultant;

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
        className="flex items-center gap-3 px-4 py-5 border-b border-sidebar-border text-left"
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
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors mb-0.5",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {!collapsed && <span>{item.label}</span>}
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
