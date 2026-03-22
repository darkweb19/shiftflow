export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#3B6FB6] to-[#2a5290] p-4">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
