import { Hono } from "hono";

const app = new Hono<{ Bindings: CloudflareBindings }>();

const WELCOME_MESSAGE = `
🎉 <b>Bienvenue sur Memory Match !</b>

🧩 Jouez et gagnez des Coins.
🏆 Progressez en gagnant de l'XP.
💰 Retirez vos récompenses lorsque vous atteignez le minimum requis.

📢 Rejoignez notre canal officiel pour suivre les dernières actualités et événements.

Bonne chance et amusez-vous !
`.trim();

app.post("/webhook", async (c) => {
  const update = await c.req.json<any>();

  const message = update.message;

  if (!message || !message.text) {
    return c.json({ ok: true });
  }

  if (!message.text.startsWith("/start")) {
    return c.json({ ok: true });
  }

  await fetch(
    `https://api.telegram.org/bot${c.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: message.chat.id,
        text: WELCOME_MESSAGE,
        parse_mode: "HTML",
        disable_web_page_preview: true,
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "📢 Rejoindre le canal",
                url: `https://t.me/${c.env.CHANNEL_USERNAME.replace("@", "")}`,
              },
            ],
          ],
        },
      }),
    }
  );

  return c.json({ ok: true });
});

export default app;
