import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

  const backendUrl = new URL(`${apiUrl}/gmail/callback`);
  if (code) backendUrl.searchParams.set("code", code);
  if (state) backendUrl.searchParams.set("state", state);

  return NextResponse.redirect(backendUrl.toString());
}
