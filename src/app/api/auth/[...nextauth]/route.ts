import NextAuth from "next-auth";
import { getAuthOptions } from "@/lib/auth";

type Ctx = { params: Promise<{ nextauth: string[] }> };

async function handler(req: Request, ctx: Ctx) {
  return NextAuth(req as never, { params: await ctx.params } as never, await getAuthOptions());
}

export { handler as GET, handler as POST };
