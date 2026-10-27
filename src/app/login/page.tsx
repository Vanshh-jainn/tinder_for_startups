import { ActionForm } from '@/components/ActionForm';
import { Hearts } from '@/components/Hearts';
import { Flame } from '@/components/TinderLogo';
import { participantLogin } from './actions';

export default function LoginPage() {
  return (
    <main className="narrow app auth">
      <Hearts />
      <Flame className="logo" />
      <p className="wordmark">Tinder for Startups</p>
      <div className="panel">
        <h1>Participant login</h1>
        <p className="muted">Use the ID and code the organisers gave you.</p>
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
      </div>
    </main>
  );
}
