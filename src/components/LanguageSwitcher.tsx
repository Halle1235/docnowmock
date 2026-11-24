import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { Languages } from "lucide-react";

const LanguageSwitcher = () => {
  const { i18n } = useTranslation();

  const toggleLanguage = () => {
    const newLang = i18n.language === 'en' ? 'ar' : 'en';
    i18n.changeLanguage(newLang);
    document.documentElement.dir = newLang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = newLang;
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggleLanguage}
      className="gap-2"
    >
      <Languages aria-hidden="true" className="h-4 w-4" />
      {i18n.language === 'en' ? <span lang="ar">العربية</span> : <span lang="en">English</span>}
    </Button>
  );
};

export default LanguageSwitcher;
