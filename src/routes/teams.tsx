import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Search, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { usePortal } from "@/lib/portal-data";

export const Route = createFileRoute("/teams")({
  component: TeamsPage,
  head: () => ({
    meta: [{ title: "Teams & Members — Project Portal" }],
  }),
});

function TeamsPage() {
  const { state, currentActor, addTeam, addMember } = usePortal();
  const [search, setSearch] = useState("");
  const [showTeam, setShowTeam] = useState(false);
  const [showMember, setShowMember] = useState(false);
  const [teamForm, setTeamForm] = useState({ name: "", companyId: state.companies[0]?.id || "", divisionId: state.divisions[0]?.id || "", leadMemberId: "" });
  const [memberForm, setMemberForm] = useState({ name: "", email: "", companyId: state.companies[0]?.id || "", divisionId: state.divisions[0]?.id || "", teamId: "", roleTitle: "" });
  const canManage = ["system_admin", "prime_consultant"].includes(currentActor.role);

  const teams = useMemo(() => {
    const q = search.toLowerCase();
    return state.teams.filter((team) => {
      const teamMembers = state.members.filter((member) => team.memberIds.includes(member.id));
      return !q || team.name.toLowerCase().includes(q) || teamMembers.some((member) => member.name.toLowerCase().includes(q));
    });
  }, [search, state.members, state.teams]);

  return (
    <div>
      <PageHeader
        title="Teams & Members"
        description="Manage operational teams, leaders, and members used by CCR, ECM, PMO, and TMS."
        actions={
          canManage ? (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowMember(true)}><UserPlus className="h-4 w-4" />Add Member</Button>
              <Button onClick={() => setShowTeam(true)}><Plus className="h-4 w-4" />Create Team</Button>
            </div>
          ) : undefined
        }
      />

      <div className="mb-6 flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search teams or members..." className="w-full rounded-lg border border-input bg-background pl-9 pr-4 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
      </div>

      <div className="space-y-4">
        {teams.map((team) => {
          const company = state.companies.find((item) => item.id === team.companyId);
          const division = state.divisions.find((item) => item.id === team.divisionId);
          const members = state.members.filter((member) => team.memberIds.includes(member.id));
          const lead = state.members.find((member) => member.id === team.leadMemberId);
          return (
            <div key={team.id} className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="border-b border-border bg-muted/30 px-5 py-4">
                <h3 className="text-sm font-semibold text-card-foreground">{team.name}</h3>
                <p className="text-xs text-muted-foreground">{company?.abbr} · {division?.abbr} · Lead: {lead?.name || "Not set"}</p>
              </div>
              <div className="divide-y divide-border">
                {members.map((member) => (
                  <div key={member.id} className="flex items-center justify-between px-5 py-3">
                    <div>
                      <p className="text-sm font-medium text-card-foreground">{member.name}</p>
                      <p className="text-xs text-muted-foreground">{member.roleTitle} · {member.email}</p>
                    </div>
                    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${member.active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>{member.active ? "Active" : "Inactive"}</span>
                  </div>
                ))}
                {!members.length && <div className="px-5 py-6 text-center text-sm text-muted-foreground">No members yet.</div>}
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={showTeam} onOpenChange={setShowTeam}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Team</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <input value={teamForm.name} onChange={(e) => setTeamForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="Team name" className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            <select value={teamForm.companyId} onChange={(e) => setTeamForm((prev) => ({ ...prev, companyId: e.target.value }))} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
              {state.companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
            </select>
            <select value={teamForm.divisionId} onChange={(e) => setTeamForm((prev) => ({ ...prev, divisionId: e.target.value }))} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
              {state.divisions.filter((division) => division.companyId === teamForm.companyId).map((division) => <option key={division.id} value={division.id}>{division.name}</option>)}
            </select>
            <select value={teamForm.leadMemberId} onChange={(e) => setTeamForm((prev) => ({ ...prev, leadMemberId: e.target.value }))} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
              <option value="">Select Lead Member</option>
              {state.members.filter((member) => member.divisionId === teamForm.divisionId).map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
            </select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTeam(false)}>Cancel</Button>
            <Button onClick={() => {
              if (!teamForm.name.trim()) return toast.error("Team name is required");
              addTeam(teamForm);
              toast.success("Team created");
              setShowTeam(false);
            }}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showMember} onOpenChange={setShowMember}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Member</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <input value={memberForm.name} onChange={(e) => setMemberForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="Full name" className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            <input value={memberForm.email} onChange={(e) => setMemberForm((prev) => ({ ...prev, email: e.target.value }))} placeholder="Email" className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            <input value={memberForm.roleTitle} onChange={(e) => setMemberForm((prev) => ({ ...prev, roleTitle: e.target.value }))} placeholder="Role title" className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            <select value={memberForm.companyId} onChange={(e) => setMemberForm((prev) => ({ ...prev, companyId: e.target.value }))} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
              {state.companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
            </select>
            <select value={memberForm.divisionId} onChange={(e) => setMemberForm((prev) => ({ ...prev, divisionId: e.target.value }))} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
              {state.divisions.filter((division) => division.companyId === memberForm.companyId).map((division) => <option key={division.id} value={division.id}>{division.name}</option>)}
            </select>
            <select value={memberForm.teamId} onChange={(e) => setMemberForm((prev) => ({ ...prev, teamId: e.target.value }))} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
              <option value="">No team</option>
              {state.teams.filter((team) => team.divisionId === memberForm.divisionId).map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
            </select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMember(false)}>Cancel</Button>
            <Button onClick={() => {
              if (!memberForm.name.trim() || !memberForm.email.trim()) return toast.error("Name and email are required");
              addMember(memberForm);
              toast.success("Member added");
              setShowMember(false);
            }}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
