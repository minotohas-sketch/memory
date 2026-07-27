import type { Screen } from "./types";

interface NavItem {
  screen: Screen;
  label: string;
  icon: string;
}

const NAV_ITEMS: NavItem[] = [
   { screen: "ptc", label: "Gagner", icon: "🖥" },
  { screen: "select", label: "Jouer", icon: "🎮" },
  { screen: "tasks", label: "Tâches", icon: "📋" },
  { screen: "leaderboard", label: "Top", icon: "🏆" },
   {screen: "linktask", label:"Shortlink", icon:"🔗"},
  { screen: "referral", label: "Amis", icon: "👥" },
  { screen: "withdraw", label: "Retirer", icon: "💳" },
];

interface Props {
  currentScreen: Screen;
  onNavigate: (screen: Screen) => void;
}

export function BottomNav({ currentScreen, onNavigate }: Props) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-ink/90 backdrop-blur-xl border-t border-gold/10 pb-[calc(env(safe-area-inset-bottom)+0.25rem)]">
      <div className="flex justify-around items-end max-w-lg mx-auto px-1">
        {NAV_ITEMS.map((item) => {
          const isActive = currentScreen === item.screen;
          return (
            <button
              key={item.screen}
              onClick={() => onNavigate(item.screen)}
              className={`relative flex flex-col items-center gap-1 py-2.5 px-1.5 rounded-2xl min-w-[60px] transition-all duration-200 active:scale-90 ${
                isActive
                  ? "text-gold"
                  : "text-sage/60 hover:text-sage"
              }`}
            >
              {/* Indicateur actif */}
              {isActive && (
                <span className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-gold shadow-[0_0_8px_#D4A853]" />
              )}

              <span className={`text-xl leading-none transition-transform duration-200 ${isActive ? "scale-110" : ""}`}>
                {item.icon}
              </span>
              <span className={`text-[10px] font-semibold leading-none tracking-wide ${isActive ? "text-gold" : "text-sage/60"}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}