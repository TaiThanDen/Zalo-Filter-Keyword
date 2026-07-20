import { redirect } from "next/navigation";
import { LoginForm } from "@/src/components/forms/login-form";
import { getCurrentUser } from "@/src/modules/auth/auth.service";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <main className="login-shell">
      <section className="login-story">
        <div className="sidebar-brand login-brand">
          <div className="brand-mark" aria-hidden="true"><span>Z</span></div>
          <div className="brand-copy"><strong>Zalo</strong><span>Tools</span><small>Alert studio</small></div>
        </div>
        <div>
          <span className="page-kicker">✦ Trung tâm vận hành</span>
          <h1>Biến tín hiệu Zalo thành <em>cảnh báo hữu ích.</em></h1>
          <p>Quản lý nhóm theo dõi, luật lọc, kênh thông báo và sức khỏe watcher trong một không gian gọn gàng.</p>
        </div>
        <div className="login-visual" aria-hidden="true"><i /><i /><i /></div>
      </section>
      <section className="login-panel">
        <div className="login-card">
          <span className="section-label">Đăng nhập quản trị</span>
          <h2>Chào bạn quay lại.</h2>
          <p>Đăng nhập để quản lý nhóm theo dõi, luật lọc, kênh gửi thông báo, nhật ký và sức khỏe watcher.</p>
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
