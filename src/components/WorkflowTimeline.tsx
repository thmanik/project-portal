import { Check, Clock, ArrowRight, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Step {
  label: string;
  department: string;
  status: "completed" | "active" | "pending";
  timestamp?: string;
}

interface WorkflowTimelineProps {
  steps: Step[];
}

export function WorkflowTimeline({ steps }: WorkflowTimelineProps) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-2">
      {steps.map((step, i) => (
        <div key={i} className="flex items-center">
          <div className="flex flex-col items-center min-w-[100px]">
            <div
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full border-2 transition-colors",
                step.status === "completed" && "border-success bg-success text-success-foreground",
                step.status === "active" && "border-primary bg-primary/10 text-primary",
                step.status === "pending" && "border-border bg-muted text-muted-foreground"
              )}
            >
              {step.status === "completed" ? (
                <Check className="h-4 w-4" />
              ) : step.status === "active" ? (
                <Clock className="h-4 w-4" />
              ) : (
                <Circle className="h-3 w-3" />
              )}
            </div>
            <p className="mt-1.5 text-xs font-medium text-foreground text-center">{step.label}</p>
            <p className="text-[10px] text-muted-foreground">{step.department}</p>
            {step.timestamp && (
              <p className="text-[10px] text-muted-foreground">{step.timestamp}</p>
            )}
          </div>
          {i < steps.length - 1 && (
            <div className={cn(
              "h-0.5 w-8 mx-1",
              steps[i + 1].status !== "pending" ? "bg-success" : "bg-border"
            )} />
          )}
        </div>
      ))}
    </div>
  );
}
