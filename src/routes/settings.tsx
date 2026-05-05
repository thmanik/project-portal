import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { usePortal } from "@/lib/portal-data";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
  head: () => ({
    meta: [{ title: "Settings — Project Portal" }],
  }),
});

function SettingsPage() {
  const { state, currentActor, updateSettings } = usePortal();
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [portalName, setPortalName] = useState(state.settings.portalName);
  const canManage = ["system_admin", "prime_consultant"].includes(currentActor.role);

  return (
    <div>
      <PageHeader title="Settings" description="Portal-level configuration for categories and naming conventions." />
      <div className="max-w-3xl space-y-6">
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-4 text-sm font-semibold text-card-foreground">General</h3>
          <div className="space-y-3">
            <label className="block text-sm font-medium text-foreground">Portal Name</label>
            <input value={portalName} onChange={(e) => setPortalName(e.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-card-foreground">Attachment Categories</h3>
            {canManage ? <Button variant="outline" size="sm" onClick={() => setShowAddCategory(true)}><Plus className="h-4 w-4" />Add Category</Button> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {state.settings.categories.map((category) => (
              <span key={category} className="inline-flex items-center gap-1 rounded-md bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
                {category}
                {canManage ? (
                  <button
                    type="button"
                    onClick={() => updateSettings({ categories: state.settings.categories.filter((item) => item !== category) })}
                  >
                    <X className="h-3 w-3" />
                  </button>
                ) : null}
              </span>
            ))}
          </div>
        </div>

        {canManage ? <Button onClick={() => { updateSettings({ portalName }); toast.success("Settings saved"); }}>Save Changes</Button> : null}
      </div>

      <Dialog open={showAddCategory} onOpenChange={setShowAddCategory}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Category</DialogTitle></DialogHeader>
          <div className="py-2">
            <input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="Category name" className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddCategory(false)}>Cancel</Button>
            <Button onClick={() => {
              if (!newCategory.trim()) return;
              if (state.settings.categories.includes(newCategory.trim())) return toast.error("Category already exists");
              updateSettings({ categories: [...state.settings.categories, newCategory.trim()] });
              toast.success("Category added");
              setNewCategory("");
              setShowAddCategory(false);
            }}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
