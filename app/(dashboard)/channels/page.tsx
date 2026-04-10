import { revalidatePath } from "next/cache";
import { createNotificationChannel, listNotificationChannels, updateNotificationChannel } from "@/src/modules/notifications/notifications.service";
import { StatusBadge } from "@/src/components/ui/status-badge";

export default async function ChannelsPage() {
  const channels = await listNotificationChannels();

  async function createChannelAction(formData: FormData) {
    "use server";
    await createNotificationChannel({
      type: "TELEGRAM",
      name: String(formData.get("name") || ""),
      isActive: formData.get("isActive") === "on",
      config: {
        botToken: String(formData.get("botToken") || ""),
        chatId: String(formData.get("chatId") || ""),
        parseMode: formData.get("parseMode") ? String(formData.get("parseMode")) : undefined,
      },
    });
    revalidatePath("/channels");
  }

  async function updateChannelAction(formData: FormData) {
    "use server";
    await updateNotificationChannel(String(formData.get("id")), {
      name: String(formData.get("name") || ""),
      isActive: formData.get("isActive") === "on",
      config: {
        botToken: String(formData.get("botToken") || ""),
        chatId: String(formData.get("chatId") || ""),
        parseMode: formData.get("parseMode") ? String(formData.get("parseMode")) : undefined,
      },
    });
    revalidatePath("/channels");
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-3xl font-semibold tracking-tight">Channels</h2>
        <p className="max-w-3xl text-sm leading-6 text-[var(--color-muted)]">
          Configure Telegram notification_channel records used by the DB-backed notification_delivery queue.
        </p>
      </section>

      <section className="card rounded-[1.6rem] p-6">
        <h3 className="text-lg font-semibold">Create Telegram channel</h3>
        <form action={createChannelAction} className="mt-4 grid gap-3 md:grid-cols-2">
          <input className="field" name="name" placeholder="Main Telegram Alert" required />
          <input className="field" name="botToken" placeholder="Bot token" required />
          <input className="field" name="chatId" placeholder="Chat ID" required />
          <select className="field" name="parseMode" defaultValue="HTML">
            <option value="HTML">HTML</option>
            <option value="MarkdownV2">MarkdownV2</option>
          </select>
          <label className="inline-flex items-center gap-2 text-sm font-medium text-[var(--color-muted)] md:col-span-2">
            <input type="checkbox" name="isActive" defaultChecked /> Active channel
          </label>
          <div className="md:col-span-2">
            <button type="submit" className="btn btn-primary">Create Channel</button>
          </div>
        </form>
      </section>

      <section className="panel rounded-[1.6rem] p-4">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Status</th>
                <th>Config</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {channels.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-sm text-[var(--color-muted)]">
                    No channels configured yet.
                  </td>
                </tr>
              ) : (
                channels.map((channel) => {
                  const config = channel.config as {
                    botToken?: string;
                    chatId?: string;
                    parseMode?: string;
                  };

                  return (
                    <tr key={channel.id}>
                      <td>
                        <form action={updateChannelAction} className="grid gap-2">
                          <input type="hidden" name="id" value={channel.id} />
                          <input className="field" name="name" defaultValue={channel.name} />
                          <input className="field" name="botToken" defaultValue={config.botToken ?? ""} />
                          <input className="field" name="chatId" defaultValue={config.chatId ?? ""} />
                          <select className="field" name="parseMode" defaultValue={config.parseMode ?? "HTML"}>
                            <option value="HTML">HTML</option>
                            <option value="MarkdownV2">MarkdownV2</option>
                          </select>
                          <label className="inline-flex items-center gap-2 text-sm text-[var(--color-muted)]">
                            <input type="checkbox" name="isActive" defaultChecked={channel.isActive} /> Active
                          </label>
                          <button type="submit" className="btn btn-secondary">Save Channel</button>
                        </form>
                      </td>
                      <td>{channel.type}</td>
                      <td><StatusBadge value={channel.isActive ? "active" : "inactive"} /></td>
                      <td>
                        <div className="space-y-1 text-sm text-[var(--color-muted)]">
                          <div>Bot: {config.botToken ? "configured" : "missing"}</div>
                          <div>Chat: {config.chatId ?? "-"}</div>
                          <div>Parse mode: {config.parseMode ?? "HTML"}</div>
                        </div>
                      </td>
                      <td>{new Date(channel.updatedAt).toLocaleString()}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
