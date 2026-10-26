import { ActionForm } from '@/components/ActionForm';
import { Flame } from '@/components/TinderLogo';
import { adminLogin } from '../actions';

export default function AdminLoginPage() {
  return (
    <main className="narrow app auth">
      <Flame className="logo" />
      <p className="wordmark">Tinder for Startups</p>
      <div className="panel">
        <h1>Admin login</h1>
        <ActionForm action={adminLogin} submitLabel="Log in">
          <label>
            Email
            <input name="email" type="email" required autoComplete="username" />
          </label>
          <label>
            Password
            <input name="password" type="password" required autoComplete="current-password" />
          </label>
        </ActionForm>
      </div>
    </main>
  );
}
