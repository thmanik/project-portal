import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileUp, Plus, Save, X } from "lucide-react";
import { toast } from "sonner";
import { type PortalSettings, usePortal } from "@/lib/portal-data";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
  head: () => ({
    meta: [{ title: "Settings — Project Portal" }],
  }),
});

type ListKey = "categories" | "workRequestTypes" | "projectInfoCategories";

const defaultLists: Record<ListKey, string[]> = {
  categories: ["Client Request", "Engineering", "General"],
  workRequestTypes: [
    "Stowage Plan",
    "Voyage Condition",
    "Mooring Plan",
    "Mooring Analysis",
    "Grillade & Sea-Fastening Plan",
    "Berthing Feasibility",
    "Loadout Feasibility",
    "Motion Analysis",
  ],
  projectInfoCategories: ["Cargo Info", "Port Info", "SPMT Info", "Vessel info", "General info"],
};

const listMeta: Record<
  ListKey,
  {
    title: string;
    description: string;
    addLabel: string;
    uploadLabel: string;
  }
> = {
  categories: {
    title: "Attachment Categories",
    description: "General fallback categories used across the portal.",
    addLabel: "Add Category",
    uploadLabel: "Import Categories",
  },
  workRequestTypes: {
    title: "General Work / Doc Request List",
    description: "Master list used when creating work requests, such as Stowage Plan, Voyage Condition, Mooring Plan, etc.",
    addLabel: "Add Work Type",
    uploadLabel: "Import Work List",
  },
  projectInfoCategories: {
    title: "Project Info Document Categories",
    description: "Categories for original client/project information documents, such as Cargo Info, Port Info, SPMT Info, Vessel info, and General info.",
    addLabel: "Add Info Category",
    uploadLabel: "Import Info Categories",
  },
};

function uniqueList(values: string[]) {
  const seen = new Set<string>();

  return values
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => {
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function parseListText(text: string) {
  return uniqueList(
    text
      .split(/\r?\n/)
      .map((row) => row.split(/\t|,/)[0])
      .map((cell) => cell.replace(/^"|"$/g, "").trim())
      .filter((item) => {
        const lowered = item.toLowerCase();
        return (
          item &&
          !lowered.includes("general work/doc request") &&
          !lowered.includes("custom list") &&
          !lowered.includes("project info document category")
        );
      })
  );
}

async function readListFile(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (extension === "xlsx" || extension === "xls") {
    throw new Error("Please export the Excel list as CSV first, then upload the CSV file.");
  }

  const text = await file.text();
  return parseListText(text);
}

function SettingsPage() {
  const { state, currentActor, updateSettings } = usePortal();
  const [portalName, setPortalName] = useState(state.settings.portalName);
  const [activeAddList, setActiveAddList] = useState<ListKey | null>(null);
  const [newItem, setNewItem] = useState("");
  const fileInputsRef = useRef<Record<string, HTMLInputElement | null>>({});
  const canManage = ["system_admin", "prime_consultant"].includes(currentActor.role);

  const getList = (key: ListKey) => {
    const value = state.settings[key];

    if (Array.isArray(value) && value.length) {
      return value;
    }

    return defaultLists[key];
  };

  const updateList = (key: ListKey, value: string[]) => {
    updateSettings({ [key]: uniqueList(value) } as Partial<PortalSettings>);
  };

  const addItem = () => {
    if (!activeAddList) return;

    const value = newItem.trim();
    if (!value) return;

    const currentList = getList(activeAddList);
    if (currentList.some((item) => item.toLowerCase() === value.toLowerCase())) {
      toast.error("This item already exists");
      return;
    }

    updateList(activeAddList, [...currentList, value]);
    toast.success("Item added");
    setNewItem("");
    setActiveAddList(null);
  };

  const removeItem = (key: ListKey, item: string) => {
    const currentList = getList(key);
    updateList(
      key,
      currentList.filter((value) => value !== item)
    );
  };

  const resetList = (key: ListKey) => {
    updateList(key, defaultLists[key]);
    toast.success("Default list restored");
  };

  const importList = async (key: ListKey, file?: File) => {
    if (!file) return;

    try {
      const importedItems = await readListFile(file);

      if (!importedItems.length) {
        toast.error("No valid list items found in the file");
        return;
      }

      updateList(key, [...getList(key), ...importedItems]);
      toast.success("List imported", {
        description: `${importedItems.length} item(s) added. Duplicate names were skipped.`,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not import this file");
    } finally {
      const input = fileInputsRef.current[key];
      if (input) input.value = "";
    }
  };

  const renderListCard = (key: ListKey) => {
    const meta = listMeta[key];
    const list = getList(key);

    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-card-foreground">{meta.title}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{meta.description}</p>
          </div>

          {canManage ? (
            <div className="flex flex-wrap gap-2">
              <input
                ref={(node) => {
                  fileInputsRef.current[key] = node;
                }}
                type="file"
                accept=".csv,.txt,.tsv"
                className="hidden"
                onChange={(event) => void importList(key, event.target.files?.[0])}
              />

              <Button variant="outline" size="sm" onClick={() => fileInputsRef.current[key]?.click()}>
                <FileUp className="h-4 w-4" />
                {meta.uploadLabel}
              </Button>

              <Button variant="outline" size="sm" onClick={() => setActiveAddList(key)}>
                <Plus className="h-4 w-4" />
                {meta.addLabel}
              </Button>

              <Button variant="outline" size="sm" onClick={() => resetList(key)}>
                Reset
              </Button>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          {list.map((item) => (
            <span key={item} className="inline-flex items-center gap-1 rounded-md bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
              {item}

              {canManage ? (
                <button type="button" className="cursor-pointer rounded hover:text-destructive" onClick={() => removeItem(key, item)} aria-label={`Remove ${item}`}>
                  <X className="h-3 w-3" />
                </button>
              ) : null}
            </span>
          ))}
        </div>

        {!list.length ? <p className="text-sm text-muted-foreground">No items configured yet.</p> : null}
      </div>
    );
  };

  return (
    <div>
      <PageHeader title="Settings" description="Portal-level configuration for master lists, categories, and naming conventions." />

      <div className="max-w-5xl space-y-6">
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-4 text-sm font-semibold text-card-foreground">General</h3>

          <div className="space-y-3">
            <label className="block text-sm font-medium text-foreground">Portal Name</label>
            <input
              value={portalName}
              onChange={(event) => setPortalName(event.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        {renderListCard("workRequestTypes")}
        {renderListCard("projectInfoCategories")}
        {renderListCard("categories")}

        {canManage ? (
          <Button
            onClick={() => {
              updateSettings({ portalName });
              toast.success("Settings saved");
            }}
          >
            <Save className="h-4 w-4" />
            Save Changes
          </Button>
        ) : null}
      </div>

      <Dialog open={!!activeAddList} onOpenChange={(open) => !open && setActiveAddList(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{activeAddList ? listMeta[activeAddList].addLabel : "Add Item"}</DialogTitle>
          </DialogHeader>

          <div className="py-2">
            <input
              value={newItem}
              onChange={(event) => setNewItem(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") addItem();
              }}
              placeholder="Type item name"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setActiveAddList(null)}>
              Cancel
            </Button>
            <Button onClick={addItem}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
