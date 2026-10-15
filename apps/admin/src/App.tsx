/**
 * The owner's admin panel. Phase 0 is the shell only: it reads nothing and
 * changes nothing. Sign-in for the owner and his staff arrives in phase 1,
 * and until then this page holds no data at all — so there is nothing here
 * for a stranger to find.
 */
const DISC = 'M32,0 A32,32 0 1 0 32,64 A32,32 0 1 0 32,0 Z';
const SLOT =
  'M16.193,33.621 L41.307,19.121 A6.5,6.5 0 0 1 47.807,30.379 L22.693,44.879 A6.5,6.5 0 0 1 16.193,33.621 Z';

const NEXT = [
  'Phase 1: you and your staff sign in, and approve technicians.',
  'Phase 2: see every job customers post.',
  'Phase 3: watch offers arrive, and place untaken jobs by hand.',
  'Phase 5: what each technician owes, and settling it.',
];

export function App() {
  return (
    <main className="shell">
      <header className="brand">
        <svg width="40" height="40" viewBox="0 0 64 64" role="img" aria-label="Pechkas logo">
          <path fill="#ffc53d" d={DISC} />
          <path fill="#14171a" d={SLOT} />
        </svg>
        <span>pechkas admin</span>
      </header>
      <h1>Being built</h1>
      <p className="lead">This is where you will run Pechkas. It holds no data yet, and nobody can sign in until phase 1.</p>
      <ul>
        {NEXT.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </main>
  );
}
