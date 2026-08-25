import { useEffect } from 'react';

interface Props {
  onDismiss: () => void;
}

// Shown once -- on a browser's very first visit only, tracked via
// hasSeenWelcome/markWelcomeSeen above -- to call out the one thing that's
// easy to miss: the Drafting toggle defaults OFF and nothing updates live
// until it's flipped on.
export function WelcomeModal({ onDismiss }: Props) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onDismiss();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onDismiss]);

  return (
    <div className="modal-overlay" onClick={onDismiss}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-modal-title"
        onClick={e => e.stopPropagation()}
      >
        <div id="welcome-modal-title" className="modal-title">Before you start</div>
        <p>
          <strong>Drafting</strong> starts OFF and makes no network calls at
          all. Flip the toggle in the top bar on once the draft actually
          begins -- it polls the sheet every few seconds and keeps the
          suggestion above up to date.
        </p>
        <p>
          Don't want to leave it on? <strong>Pull once</strong>, right next
          to it, does a single manual refresh instead.
        </p>
        <button type="button" className="btn-ghost modal-dismiss" onClick={onDismiss} autoFocus>
          Got it
        </button>
      </div>
    </div>
  );
}
