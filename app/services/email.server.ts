import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
export interface EmailSender {
  send(message: {
    id: string;
    to: string;
    subject: string;
    text: string;
  }): Promise<void>;
}
export class DevelopmentEmailSender implements EmailSender {
  async send(message: {
    id: string;
    to: string;
    subject: string;
    text: string;
  }) {
    if (process.env.NODE_ENV === "production")
      throw new Error(
        "Development email sender is forbidden in production. Implement a production EmailSender.",
      );
    const directory = path.resolve(process.env.DEV_OUTBOX_DIR || "work/outbox");
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(
      path.join(directory, `${message.id}.json`),
      JSON.stringify({ developmentOnly: true, ...message }, null, 2),
      { mode: 0o600 },
    );
  }
}

export async function removeDevelopmentMessages(ids: string[]) {
  if (process.env.NODE_ENV === "production") return;
  const directory = path.resolve(process.env.DEV_OUTBOX_DIR || "work/outbox");
  for (const id of ids) {
    if (!/^[a-z0-9]+$/i.test(id)) throw new Error("Invalid invitation ID");
    try {
      await unlink(path.join(directory, `${id}.json`));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
  }
}
