"use client";

import { AlertTriangle } from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";
import { Warning } from "@/lib/schemas";

export function WarningDot({ warnings }: { warnings?: Warning[] }) {
  if (!warnings?.length) return null;
  return (
    <Tooltip
      content={
        <div className="space-y-1">
          {warnings.map((warning, index) => (
            <p key={`${warning.code}-${index}`}>
              {warning.message}
              {warning.improveWith ? ` ${warning.improveWith}` : ""}
            </p>
          ))}
        </div>
      }
    >
      <span className="inline-flex text-amber-600" aria-label="Low confidence warning">
        <AlertTriangle size={16} />
      </span>
    </Tooltip>
  );
}
