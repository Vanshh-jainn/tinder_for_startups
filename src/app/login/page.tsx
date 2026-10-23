import { ActionForm } from '@/components/ActionForm';
import { participantLogin } from './actions';

export default function LoginPage() {
  return (
    <main className="narrow">
      <h1>Participant login</h1>
      <ActionForm action={participantLogin} submitLabel="Log in">
        <label>
          Participant ID
          <input name="participantId" placeholder="P12" required autoComplete="username" autoCapitalize="characters" />
        </label>
        <label>
          Code
          <input name="code" required autoComplete="current-password" autoCapitalize="characters" />
        </label>
      </ActionForm>
    </main>
  );
}
