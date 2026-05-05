import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Building2 } from "lucide-react";
import { toast } from "sonner";
import { usePortal } from "@/lib/portal-data";

export const Route = createFileRoute("/companies")({
  component: CompaniesPage,
  head: () => ({
    meta: [{ title: "Companies & Divisions — Project Portal" }],
  }),
});

function CompaniesPage() {
  const { state, currentActor, addCompany, addDivision } = usePortal();
  const [showCompany, setShowCompany] = useState(false);
  const [showDivisionFor, setShowDivisionFor] = useState<string | null>(null);
  const [companyForm, setCompanyForm] = useState({ name: "", abbr: "", type: "Partner" });
  const [divisionForm, setDivisionForm] = useState({ name: "", abbr: "", type: "Operational Division" });
  const canManage = ["system_admin", "prime_consultant"].includes(currentActor.role);

  return (
    <div>
      <PageHeader
        title="Companies & Divisions"
        description="Manage the organizational structure used by the project management portal."
        actions={canManage ? <Button onClick={() => setShowCompany(true)}><Plus className="h-4 w-4" />Add Company</Button> : undefined}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {state.companies.map((company) => {
          const divisions = state.divisions.filter((division) => division.companyId === company.id);
          return (
            <div key={company.id} className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="border-b border-border px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Building2 className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-card-foreground">{company.name}</h3>
                    <p className="text-xs text-muted-foreground">{company.abbr} · {company.type}</p>
                  </div>
                </div>
              </div>
              <div className="divide-y divide-border">
                {divisions.map((division) => (
                  <div key={division.id} className="px-5 py-3">
                    <p className="text-sm font-medium text-card-foreground">{division.name}</p>
                    <p className="text-xs text-muted-foreground">{division.abbr} · {division.type}</p>
                  </div>
                ))}
              </div>
              {canManage && (
                <div className="border-t border-border px-5 py-3">
                  <Button variant="outline" size="sm" className="w-full" onClick={() => setShowDivisionFor(company.id)}>
                    <Plus className="h-4 w-4" />Add Division
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Dialog open={showCompany} onOpenChange={setShowCompany}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Company</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <input value={companyForm.name} onChange={(e) => setCompanyForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="Company name" className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            <input value={companyForm.abbr} onChange={(e) => setCompanyForm((prev) => ({ ...prev, abbr: e.target.value }))} placeholder="Abbreviation" className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            <input value={companyForm.type} onChange={(e) => setCompanyForm((prev) => ({ ...prev, type: e.target.value }))} placeholder="Type" className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCompany(false)}>Cancel</Button>
            <Button onClick={() => {
              if (!companyForm.name.trim() || !companyForm.abbr.trim()) return toast.error("Name and abbreviation are required");
              addCompany(companyForm);
              toast.success("Company added");
              setCompanyForm({ name: "", abbr: "", type: "Partner" });
              setShowCompany(false);
            }}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!showDivisionFor} onOpenChange={() => setShowDivisionFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Division</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <input value={divisionForm.name} onChange={(e) => setDivisionForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="Division name" className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            <input value={divisionForm.abbr} onChange={(e) => setDivisionForm((prev) => ({ ...prev, abbr: e.target.value }))} placeholder="Division abbreviation" className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            <input value={divisionForm.type} onChange={(e) => setDivisionForm((prev) => ({ ...prev, type: e.target.value }))} placeholder="Division type" className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDivisionFor(null)}>Cancel</Button>
            <Button onClick={() => {
              if (!showDivisionFor || !divisionForm.name.trim() || !divisionForm.abbr.trim()) return toast.error("Division name and abbreviation are required");
              addDivision({ ...divisionForm, companyId: showDivisionFor });
              toast.success("Division added");
              setDivisionForm({ name: "", abbr: "", type: "Operational Division" });
              setShowDivisionFor(null);
            }}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
