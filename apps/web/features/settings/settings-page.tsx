import Link from "next/link";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/shared/page-header";

/** The frame every Settings section shares: back link, title, description, content. */
export function SettingsPage({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/app/settings" className="text-sm text-muted-foreground hover:text-foreground">
          ← Settings
        </Link>
        <PageHeader className="mt-2" title={title} description={description} actions={actions} />
      </div>
      {children}
    </div>
  );
}
