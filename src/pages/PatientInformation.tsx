import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "@/components/LanguageSwitcher";

export function PatientInformationLinks({ newTab = false }: { newTab?: boolean }) {
  const { t } = useTranslation();
  return <nav aria-label={t("legal.links")} className="flex flex-wrap justify-center gap-x-5 gap-y-2 py-2">
    {(["privacy", "terms"] as const).map(kind =>
      <Link key={kind} className="text-primary underline underline-offset-4" to={`/${kind}`}
        target={newTab ? "_blank" : undefined} rel={newTab ? "noopener noreferrer" : undefined}>{t(`legal.${kind}`)}</Link>)}
  </nav>;
}

export default function PatientInformation({ kind }: { kind: "privacy" | "terms" }) {
  const { t, i18n } = useTranslation();
  const sections = t(`legal.${kind}Sections`, { returnObjects: true }) as { title: string; text: string }[];
  return <main dir={i18n.dir()} className="container mx-auto max-w-2xl space-y-7 px-4 py-8">
    <header className="flex items-center justify-between"><Link to="/" className="text-primary underline">{t("legal.home")}</Link><LanguageSwitcher /></header>
    <div><p className="text-sm text-muted-foreground">{t("legal.draft")}</p><h1 className="mt-1 text-3xl font-bold">{t(`legal.${kind}`)}</h1></div>
    {sections.map(section => <section key={section.title}><h2 className="mb-2 text-xl font-semibold">{section.title}</h2><p>{section.text}</p></section>)}
  </main>;
}
