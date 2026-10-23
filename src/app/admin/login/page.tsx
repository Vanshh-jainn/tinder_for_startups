import { ActionForm } from '@/components/ActionForm';
import { adminLogin } from '../actions';

export default function AdminLoginPage() {
  return (
    <main className="narrow">
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
    </main>
  );
}
