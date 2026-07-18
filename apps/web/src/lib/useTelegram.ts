import { useEffect, useMemo, useState } from "react";
import type { TelegramWebAppUser } from "../types/telegram";

// En dev navigateur classique (hors Telegram), window.Telegram n'existe pas :
// on retombe sur un utilisateur factice pour pouvoir tester le jeu directement
// dans le navigateur, sans devoir ouvrir Telegram à chaque fois.
const MOCK_USER: TelegramWebAppUser = {
  id: 0,
  first_name: "Joueur",
};

export function useTelegram() {
  const tg = typeof window !== "undefined" ? window.Telegram?.WebApp : undefined;
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!tg) {
      setIsReady(true); // mode dev hors Telegram
      return;
    }
    tg.ready();
    tg.expand();
    try {
      tg.setBackgroundColor("#0b1f1a");
      tg.setHeaderColor("#0b1f1a");
    } catch {
      // méthodes absentes sur certaines anciennes versions du client Telegram — sans gravité
    }
    setIsReady(true);
  }, [tg]);

  const user = tg?.initDataUnsafe.user ?? MOCK_USER;
  const startParam = tg?.initDataUnsafe.start_param;
  const initData = tg?.initData ?? "";
  const isInTelegram = Boolean(tg);

  const haptic = useMemo(
    () => ({
      tap: () => tg?.HapticFeedback.impactOccurred("light"),
      match: () => tg?.HapticFeedback.notificationOccurred("success"),
      fail: () => tg?.HapticFeedback.notificationOccurred("error"),
    }),
    [tg]
  );

  return { tg, user, startParam, initData, isInTelegram, isReady, haptic };
}
