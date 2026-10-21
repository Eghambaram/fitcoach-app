import type { Metadata } from "next";
import { ErrorState } from "@/components/shared/status";
import { Card } from "@/components/ui/card";
import { SettingsPage } from "@/features/settings/settings-page";
import { TemplateEditor } from "@/features/settings/template-editor";
import { serverApi } from "@/lib/api/server";

export const metadata: Metadata = { title: "Message templates" };

/** WhatsApp message templates (PROMPT §8.12, D20): one per purpose, editable, reset to default. */
export default async function TemplatesSettingsPage() {
  const api = await serverApi();
  const { data, response } = await api.GET("/v1/settings/message-templates");

  return (
    <SettingsPage
      title="Message templates"
      description="Ready-made WhatsApp messages. You always review and send them yourself."
    >
      {response.ok && data ? (
        <div className="flex flex-col gap-4">
          {data.templates.map((template) => (
            <TemplateEditor key={`${template.purpose}-${template.body}`} template={template} />
          ))}
        </div>
      ) : (
        <Card>
          <ErrorState description="We couldn't load your templates. Please try again." />
        </Card>
      )}
    </SettingsPage>
  );
}
