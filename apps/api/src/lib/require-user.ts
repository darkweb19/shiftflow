import type { Request } from "express";
import { getSupabaseAdmin } from "./supabase";

/** Validates Supabase JWT from `Authorization: Bearer <access_token>`. */
export async function getUserFromBearer(
  req: Request
): Promise<{ id: string; name: string } | null> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7).trim();
  if (!token) return null;

  const sb = getSupabaseAdmin();
  const {
    data: { user },
    error,
  } = await sb.auth.getUser(token);

  if (error || !user) return null;

  const { data: profile } = await sb
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .single();

  const name =
    (profile?.name as string | undefined)?.trim() ||
    (user.user_metadata?.name as string | undefined)?.trim() ||
    user.email ||
    "User";

  return { id: user.id, name };
}
