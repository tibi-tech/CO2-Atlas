import { useTranslation } from "react-i18next";

export default function About() {
  const { t } = useTranslation();
  const terms = t("about.terms", { returnObjects: true }) as string[][];
  return (
    <article className="mx-auto max-w-3xl space-y-10">
      <header className="rise">
        <p className="eyebrow">{t("nav.about")}</p>
        <h1 className="display mt-3 text-6xl">{t("about.title")}</h1>
        <p className="mt-5 text-lg leading-relaxed text-ink-2">{t("about.lead")}</p>
      </header>

      <div className="rise rise-1 rounded-2xl bg-ink p-8 text-center text-paper">
        <p className="display text-2xl text-leaf sm:text-4xl">{t("about.formula")}</p>
        <p className="num mt-3 text-paper/70">{t("about.co2")}</p>
      </div>

      <dl className="rise rise-2 card divide-y divide-line">
        {terms.map(([k, v]) => (
          <div key={k} className="grid gap-2 p-5 sm:grid-cols-[110px_1fr]">
            <dt className="display text-xl text-moss">{k}</dt>
            <dd className="text-ink-2">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="rise rise-3 grid gap-4 sm:grid-cols-2">
        <p className="card p-5 text-sm leading-relaxed text-ink-2">{t("about.origin")}</p>
        <p className="card p-5 text-sm leading-relaxed text-ink-2">{t("about.limits")}</p>
      </div>
    </article>
  );
}
