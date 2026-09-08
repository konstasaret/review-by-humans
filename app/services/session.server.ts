import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import { Session } from "@shopify/shopify-api";
import db from "../db.server";
import { encrypt, decrypt } from "./crypto.server";
const base = new PrismaSessionStorage(db);
function decode(session: Session | undefined) {
  if (session?.accessToken) session.accessToken = decrypt(session.accessToken);
  if (session?.refreshToken)
    session.refreshToken = decrypt(session.refreshToken);
  return session;
}
export const secureSessionStorage = {
  async storeSession(session: Session) {
    const copy = new Session({ ...session });
    if (copy.accessToken) copy.accessToken = encrypt(copy.accessToken);
    if (copy.refreshToken) copy.refreshToken = encrypt(copy.refreshToken);
    return base.storeSession(copy);
  },
  async loadSession(id: string) {
    return decode(await base.loadSession(id));
  },
  async findSessionsByShop(shop: string) {
    return (await base.findSessionsByShop(shop)).map((s) => decode(s)!);
  },
  deleteSession: (id: string) => base.deleteSession(id),
  deleteSessions: (ids: string[]) => base.deleteSessions(ids),
};
