import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Sans ça, une erreur pendant le rendu initial (ex : le front s'attend à un
 * champ que le backend déployé ne renvoie pas encore) fait planter React
 * silencieusement — écran blanc, aucune information pour diagnostiquer.
 * Avec ça, l'erreur exacte s'affiche directement à l'écran, plus besoin
 * d'ouvrir la console pour la première piste de diagnostic.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error("Erreur non interceptée :", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-ink px-6 text-center">
          <p className="text-coral font-semibold">L'app n'a pas pu se charger</p>
          <p className="text-xs text-sage font-mono break-all bg-surface border border-surface-2 rounded-xl px-4 py-3">
            {this.state.error.message}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 rounded-xl bg-gold text-ink font-bold px-6 py-3"
          >
            Recharger
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
