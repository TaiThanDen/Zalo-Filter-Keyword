import { redirect } from "next/navigation";
import { LoginForm } from "@/src/components/forms/login-form";
import { getCurrentUser } from "@/src/modules/auth/auth.service";

export default async function LoginPage() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10 md:px-6 md:py-12">
      <section className="card w-full max-w-md rounded-[2rem] p-6 md:p-8">
        <div className="mb-8 space-y-3">
          <span className="inline-flex rounded-full bg-[var(--color-accent-soft)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-accent)]">
            Quản trị viên
          </span>
          <h1 className="text-3xl font-semibold tracking-tight">Quản trị cảnh báo Zalo</h1>
          <p className="text-sm leading-6 text-[var(--color-muted)]">
            Đăng nhập để quản lý nhóm theo dõi, luật lọc, kênh gửi thông báo, nhật ký và sức khỏe watcher.
          </p>
        </div>
        <LoginForm />
      </section>
    </main>
  );
}
