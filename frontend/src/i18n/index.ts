import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import en from "./en.json";
import pt from "./pt.json";

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en }, pt: { translation: pt } },
    fallbackLng: "en",
    supportedLngs: ["en", "pt"],
    nonExplicitSupportedLngs: true,
    interpolation: { escapeValue: false },
    returnObjects: true,
    detection: { order: ["localStorage", "navigator"], caches: ["localStorage"], lookupLocalStorage: "co2.lang" },
  });

i18n.on("languageChanged", (lng) => {
  document.documentElement.lang = lng;
});
document.documentElement.lang = i18n.resolvedLanguage ?? "en";

export const lang = () => (i18n.resolvedLanguage?.startsWith("pt") ? "pt" : "en");

export function fmt(v: number | null | undefined, digits = 0) {
  if (v == null || Number.isNaN(v)) return "—";
  return new Intl.NumberFormat(lang() === "pt" ? "pt-PT" : "en-GB", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(v);
}

export function monthName(m: number, style: "long" | "short" = "long") {
  return new Intl.DateTimeFormat(lang() === "pt" ? "pt-PT" : "en-GB", { month: style }).format(new Date(2000, m - 1, 1));
}

export function period(year: number, month: number) {
  return `${monthName(month)} ${year}`;
}

export function errorText(code: string, t: (k: string) => string) {
  const known: Record<string, Record<string, string>> = {
    en: {
      geometry_too_large: "Region is too large for this demo.",
      geometry_too_small: "Region is too small.",
      geometry_not_polygon: "The shape must be a polygon.",
      geometry_invalid: "Invalid geometry.",
      geometry_not_wgs84: "Coordinates must be longitude/latitude (WGS84).",
      file_unreadable: "Could not read that file.",
      shapefile_missing_shp: "The zip has no .shp file.",
      month_out_of_range: "Months must be between April 2017 and last month.",
      too_many_months: "Too many months in one request.",
      legacy_only_reference: "The thesis method only works for the Oeiras reference (June 2024).",
      invalid_password: "Wrong password.",
      ndvi_range_invalid: "NDVI max must be greater than min.",
      copernicus_auth_failed: "Copernicus rejected these credentials. Check the Client ID and secret.",
      copernicus_env_managed: "Credentials are managed by the server .env file.",
      copernicus_not_configured: "No Copernicus credentials configured.",
      settings_local_only: "Settings can only be changed from the computer running the app (or set DEMO_PASSWORD).",
    },
    pt: {
      geometry_too_large: "A região é demasiado grande para esta demo.",
      geometry_too_small: "A região é demasiado pequena.",
      geometry_not_polygon: "A forma tem de ser um polígono.",
      geometry_invalid: "Geometria inválida.",
      geometry_not_wgs84: "As coordenadas têm de ser longitude/latitude (WGS84).",
      file_unreadable: "Não foi possível ler o ficheiro.",
      shapefile_missing_shp: "O zip não tem ficheiro .shp.",
      month_out_of_range: "Os meses têm de estar entre abril de 2017 e o mês passado.",
      too_many_months: "Demasiados meses num só pedido.",
      legacy_only_reference: "O método da tese só funciona para a referência de Oeiras (junho de 2024).",
      invalid_password: "Palavra-passe errada.",
      ndvi_range_invalid: "O NDVI máx. tem de ser maior que o mín.",
      copernicus_auth_failed: "O Copernicus rejeitou estas credenciais. Verifique o Client ID e o secret.",
      copernicus_env_managed: "As credenciais são geridas pelo ficheiro .env do servidor.",
      copernicus_not_configured: "Não há credenciais Copernicus configuradas.",
      settings_local_only: "As definições só podem ser alteradas no computador onde a aplicação corre (ou defina DEMO_PASSWORD).",
    },
  };
  return known[lang()][code] ?? (code || t("common.error"));
}

export default i18n;
